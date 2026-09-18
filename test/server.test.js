import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import { WebSocket } from 'ws';
import { createServer } from '../src/server.js';

let server;
let port;

before(async () => {
  server = createServer(0); // port 0 = OS assigns free port
  await new Promise(r => server.httpServer.listen(0, '127.0.0.1', r));
  port = server.httpServer.address().port;
});

after(async () => {
  await server.close();
});

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { origin: 'http://localhost:3000' }
    });
    // Buffer incoming messages so nextMessage() can never miss one that
    // arrives before the caller gets a chance to register its own listener.
    ws._messageQueue = [];
    ws._messageWaiters = [];
    ws.on('message', (d) => {
      const parsed = JSON.parse(d.toString());
      if (ws._messageWaiters.length > 0) {
        ws._messageWaiters.shift()(parsed);
      } else {
        ws._messageQueue.push(parsed);
      }
    });
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function nextMessage(ws) {
  // Drain from buffer if a message already arrived; otherwise wait.
  if (ws._messageQueue && ws._messageQueue.length > 0) {
    return Promise.resolve(ws._messageQueue.shift());
  }
  return new Promise((resolve, reject) => {
    if (ws._messageWaiters) {
      ws._messageWaiters.push(resolve);
    } else {
      ws.once('message', d => resolve(JSON.parse(d.toString())));
    }
    ws.once('error', reject);
  });
}

/**
 * Initiate a graceful close and await server-side cleanup.
 * Each test must call this instead of bare ws.close() to prevent lingering
 * connections from polluting the shared room in subsequent tests.
 */
function closeAndWait(ws) {
  return new Promise(resolve => {
    ws.once('close', resolve);
    ws.close();
  });
}

test('server sends joined message on connect', async () => {
  const ws = await connect();
  const msg = await nextMessage(ws);
  assert.equal(msg.type, 'joined');
  assert.ok(typeof msg.name === 'string');
  assert.ok(msg.name.includes(' '));
  assert.ok(typeof msg.roomSize === 'number');
  await closeAndWait(ws);
});

test('message is broadcast to all room peers', async () => {
  const ws1 = await connect();
  const join1 = await nextMessage(ws1);
  const ws2 = await connect();
  const join2 = await nextMessage(ws2);

  // ws2 should also get a "joined" notification about ws2
  // Send message from ws1, expect ws2 to receive it
  const received = nextMessage(ws2);
  ws1.send(JSON.stringify({ type: 'msg', text: 'hello' }));
  const msg = await received;

  assert.equal(msg.type, 'msg');
  assert.equal(msg.from, join1.name);
  assert.equal(msg.text, 'hello');
  assert.ok(typeof msg.ts === 'number');
  await closeAndWait(ws1);
  await closeAndWait(ws2);
});

test('client cannot spoof sender name', async () => {
  const ws1 = await connect();
  const join1 = await nextMessage(ws1);
  const ws2 = await connect();
  await nextMessage(ws2); // consume join

  const received = nextMessage(ws2);
  ws1.send(JSON.stringify({ type: 'msg', text: 'hi', from: 'Hacker Name' }));
  const msg = await received;

  assert.equal(msg.from, join1.name); // must be server-assigned
  await closeAndWait(ws1);
  await closeAndWait(ws2);
});

test('rejects message with text over 500 chars', async () => {
  const ws = await connect();
  await nextMessage(ws); // consume join

  // Send oversized message — should be dropped, connection stays open
  ws.send(JSON.stringify({ type: 'msg', text: 'x'.repeat(501) }));

  // Send valid message after — should still work
  const received = nextMessage(ws);
  ws.send(JSON.stringify({ type: 'msg', text: 'still alive' }));
  const msg = await received;
  assert.equal(msg.text, 'still alive');
  await closeAndWait(ws);
});

test('rejects connection from disallowed origin', async () => {
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { origin: 'https://evil.com' }
    });
    ws.once('open', () => reject(new Error('Should not have opened')));
    ws.once('unexpected-response', (_, res) => {
      assert.equal(res.statusCode, 403);
      resolve();
    });
    ws.once('error', (err) => {
      // ws may emit error alongside unexpected-response; tolerate if 403 already verified
      // If we get here without having resolved, fail
      reject(err);
    });
  });
});

test('unknown message types are dropped silently', async () => {
  const ws = await connect();
  await nextMessage(ws); // consume join

  ws.send(JSON.stringify({ type: 'unknown', text: 'x' }));

  // Valid message should still work after unknown type
  const received = nextMessage(ws);
  ws.send(JSON.stringify({ type: 'msg', text: 'ok' }));
  const msg = await received;
  assert.equal(msg.text, 'ok');
  await closeAndWait(ws);
});

test('301st connection from same IP is refused with code 1008', async () => {
  // Open 300 connections (the limit), then verify the 301st is rejected.
  // Use Promise.all to open them in parallel — sequential would be slow.
  const sockets = await Promise.all(
    Array.from({ length: 300 }, () => connect())
  );

  // 301st connection should be refused
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { origin: 'http://localhost:3000' }
    });
    ws.once('close', (code) => {
      assert.equal(code, 1008);
      resolve();
    });
    ws.once('error', reject);
  });

  // Clean up all 300 sockets
  await Promise.all(sockets.map(ws => closeAndWait(ws)));
});
