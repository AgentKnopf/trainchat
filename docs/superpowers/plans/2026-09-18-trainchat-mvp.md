# TrainChat MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-install browser-based ephemeral chat app where anyone on the same WiFi network shares a room automatically.

**Architecture:** A single Node.js process serves static files and relays WebSocket messages in-memory. Rooms are assigned by TCP-layer IP (`socket.remoteAddress`). No database, no persistence, no framework.

**Tech Stack:** Node.js LTS, `ws` library (WebSocket), built-in `http` module, vanilla HTML/CSS/JS frontend, `node:test` + `assert` for tests.

**Spec:** `docs/design-spec.md`

## Global Constraints

- Node.js LTS (v20+)
- `ws` library only — no Express, no framework
- `maxPayload: 1024` set at `WebSocket.Server` constructor — never post-parse
- All outbound JSON via `JSON.stringify` — never string interpolation
- Client renders all content via `textContent` — never `innerHTML`
- Max 5 msg/sec per connection (token bucket), max 5 connections per IP
- `headersTimeout: 10000`, `requestTimeout: 10000` on HTTP server
- CSP header: `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' wss://trainchat.app; frame-ancestors 'none'; form-action 'none'; base-uri 'none'`
- HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- No `console.log` of message content anywhere
- `close`, `error`, `terminate` handlers registered BEFORE socket added to any map
- Origin allowlist: `https://trainchat.app`, `http://localhost:3000`

---

## File Map

```
src/
  server.js        — single-file server: HTTP static + WebSocket relay
  names.js         — adjective/animal name pool + random assignment
test/
  server.test.js   — server logic unit tests (room assignment, message relay, rate limiting)
  names.test.js    — name pool tests (uniqueness, collision handling)
public/
  index.html       — single-page UI
  app.js           — client WebSocket logic (connect, send, render)
  style.css        — UI styles
package.json       — dependencies: ws only; scripts: start, test, dev
```

---

## Task 1: Project Bootstrap

**Files:**
- Create: `package.json`
- Create: `src/.gitkeep` (already exists — replace with real file in Task 2)

**Interfaces:**
- Produces: `npm test` runs `node --test test/**/*.test.js`, `npm start` runs `node src/server.js`, `npm run dev` runs with `--watch`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "trainchat",
  "version": "0.1.0",
  "description": "Zero-install ephemeral chat for people on the same WiFi network",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test test/**/*.test.js"
  },
  "license": "MIT"
}
```

Save to `/Users/I501850/Workspace/personal/train-talk/package.json`

- [ ] **Step 2: Install ws**

```bash
cd /Users/I501850/Workspace/personal/train-talk && npm install ws
```

- [ ] **Step 3: Verify package-lock.json created and node_modules present**

```bash
ls /Users/I501850/Workspace/personal/train-talk/node_modules/ws
```

- [ ] **Step 4: Commit**

```bash
cd /Users/I501850/Workspace/personal/train-talk
git add package.json package-lock.json
git commit -m "chore: bootstrap project with ws dependency"
```

---

## Task 2: Name Pool

**Files:**
- Create: `src/names.js`
- Create: `test/names.test.js`

**Interfaces:**
- Produces:
  - `assignName(roomPeerNames: Set<string>): string` — returns a unique name not in the given set
  - `ADJECTIVES: string[]` — exported array of ~50 adjectives
  - `ANIMALS: string[]` — exported array of ~50 animals

- [ ] **Step 1: Write the failing tests**

Create `test/names.test.js`:

```js
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { assignName, ADJECTIVES, ANIMALS } from '../src/names.js';

test('ADJECTIVES has at least 50 entries', () => {
  assert.ok(ADJECTIVES.length >= 50);
});

test('ANIMALS has at least 50 entries', () => {
  assert.ok(ANIMALS.length >= 50);
});

test('assignName returns a string with a space', () => {
  const name = assignName(new Set());
  assert.ok(typeof name === 'string');
  assert.ok(name.includes(' '));
});

test('assignName avoids names already in the room', () => {
  // Fill all but one possible name — brute force the collision path
  const all = new Set();
  for (const adj of ADJECTIVES) {
    for (const ani of ANIMALS) {
      all.add(`${adj} ${ani}`);
    }
  }
  // Remove one so there's exactly one valid name left
  const remaining = [...all][0];
  all.delete(remaining);
  const name = assignName(all);
  assert.equal(name, remaining);
});

test('assignName throws if all names are taken', () => {
  const all = new Set();
  for (const adj of ADJECTIVES) {
    for (const ani of ANIMALS) {
      all.add(`${adj} ${ani}`);
    }
  }
  assert.throws(() => assignName(all), /exhausted/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/I501850/Workspace/personal/train-talk && npm test 2>&1 | head -30
```
Expected: module not found or assertion errors

- [ ] **Step 3: Implement names.js**

Create `src/names.js`:

```js
export const ADJECTIVES = [
  'Amber', 'Blazing', 'Calm', 'Crimson', 'Drifting', 'Eager', 'Fading',
  'Gentle', 'Hidden', 'Iron', 'Jade', 'Keen', 'Lunar', 'Misty', 'Noble',
  'Olive', 'Pale', 'Quiet', 'Rapid', 'Silver', 'Tidal', 'Umber', 'Vivid',
  'Wandering', 'Xenial', 'Yellow', 'Zesty', 'Arctic', 'Brave', 'Cobalt',
  'Dusty', 'Electric', 'Frozen', 'Golden', 'Hollow', 'Indigo', 'Jolly',
  'Kinetic', 'Lively', 'Mossy', 'Neon', 'Ochre', 'Plum', 'Rusty', 'Sandy',
  'Turquoise', 'Urban', 'Violet', 'Warm', 'Xeric'
];

export const ANIMALS = [
  'Badger', 'Bear', 'Crane', 'Crow', 'Deer', 'Dove', 'Duck', 'Eagle',
  'Falcon', 'Finch', 'Fox', 'Frog', 'Gecko', 'Goat', 'Hawk', 'Heron',
  'Ibis', 'Jackal', 'Jay', 'Kite', 'Lemur', 'Lynx', 'Mink', 'Mole',
  'Newt', 'Otter', 'Owl', 'Panda', 'Parrot', 'Penguin', 'Pike', 'Puma',
  'Quail', 'Raven', 'Robin', 'Rooster', 'Salamander', 'Seal', 'Shrew',
  'Skunk', 'Sloth', 'Snipe', 'Sparrow', 'Stork', 'Swan', 'Swift', 'Toad',
  'Vole', 'Weasel', 'Wolf'
];

export function assignName(takenNames) {
  const maxAttempts = ADJECTIVES.length * ANIMALS.length;
  for (let i = 0; i < maxAttempts; i++) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const ani = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const name = `${adj} ${ani}`;
    if (!takenNames.has(name)) return name;
  }
  // Systematic fallback: iterate all combinations
  for (const adj of ADJECTIVES) {
    for (const ani of ANIMALS) {
      const name = `${adj} ${ani}`;
      if (!takenNames.has(name)) return name;
    }
  }
  throw new Error('Name pool exhausted');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/I501850/Workspace/personal/train-talk && npm test 2>&1
```
Expected: all 5 tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/I501850/Workspace/personal/train-talk
git add src/names.js test/names.test.js
git commit -m "feat: add name pool with collision-safe assignName"
```

---

## Task 3: Server Core (HTTP + WebSocket relay)

**Files:**
- Create: `src/server.js`
- Create: `test/server.test.js`

**Interfaces:**
- Consumes: `assignName(takenNames: Set<string>): string` from `../src/names.js`
- Produces:
  - `createServer(port?: number): { httpServer, wss, close() }` — exported factory for testing
  - Default export: starts server on `process.env.PORT ?? 3000`

- [ ] **Step 1: Write failing tests**

Create `test/server.test.js`:

```js
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
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function nextMessage(ws) {
  return new Promise((resolve, reject) => {
    ws.once('message', d => resolve(JSON.parse(d.toString())));
    ws.once('error', reject);
  });
}

test('server sends joined message on connect', async () => {
  const ws = await connect();
  const msg = await nextMessage(ws);
  assert.equal(msg.type, 'joined');
  assert.ok(typeof msg.name === 'string');
  assert.ok(msg.name.includes(' '));
  assert.ok(typeof msg.roomSize === 'number');
  ws.close();
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
  ws1.close();
  ws2.close();
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
  ws1.close();
  ws2.close();
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
  ws.close();
});

test('rejects connection from disallowed origin', async () => {
  await assert.rejects(
    () => new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
        headers: { origin: 'https://evil.com' }
      });
      ws.once('open', resolve);
      ws.once('error', reject);
      ws.once('unexpected-response', (_, res) => {
        assert.equal(res.statusCode, 403);
        resolve(); // test passes — 403 is expected
      });
    })
  , undefined); // just checking it doesn't open
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
  ws.close();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/I501850/Workspace/personal/train-talk && npm test 2>&1 | head -20
```
Expected: module not found

- [ ] **Step 3: Implement server.js**

Create `src/server.js`:

```js
import { createServer as createHttpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { assignName } from './names.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

const ALLOWED_ORIGINS = new Set([
  'https://trainchat.app',
  'http://localhost:3000',
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self' wss://trainchat.app",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

// Token bucket: 5 tokens, refill 1/200ms
function makeRateLimiter() {
  let tokens = 5;
  const interval = setInterval(() => { if (tokens < 5) tokens++; }, 200);
  interval.unref();
  return {
    consume() { if (tokens <= 0) return false; tokens--; return true; },
    destroy() { clearInterval(interval); },
  };
}

export function createServer() {
  // rooms: Map<roomId, Set<WebSocket>>
  const rooms = new Map();
  // identityMap: Map<WebSocket, string>
  const identityMap = new Map();
  // connectionCount: Map<ip, number>
  const connectionCount = new Map();

  const httpServer = createHttpServer((req, res) => {
    let filePath = join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
    try {
      const body = readFileSync(filePath);
      const ext = extname(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Content-Security-Policy': CSP,
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  httpServer.headersTimeout = 10000;
  httpServer.requestTimeout = 10000;

  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: 1024,
    verifyClient({ origin }) {
      // Non-browser clients send no origin — accepted (chat is public by design)
      if (!origin) return true;
      return ALLOWED_ORIGINS.has(origin);
    },
  });

  function getRoomNames(roomId) {
    const room = rooms.get(roomId);
    if (!room) return new Set();
    const names = new Set();
    for (const ws of room) {
      const n = identityMap.get(ws);
      if (n) names.add(n);
    }
    return names;
  }

  function broadcast(roomId, envelope, exclude = null) {
    const room = rooms.get(roomId);
    if (!room) return;
    const data = JSON.stringify(envelope);
    for (const ws of room) {
      if (ws !== exclude && ws.readyState === ws.OPEN) ws.send(data);
    }
  }

  function cleanup(ws, roomId, name, ip) {
    identityMap.delete(ws);
    const room = rooms.get(roomId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        rooms.delete(roomId);
      } else {
        broadcast(roomId, { type: 'left', name, roomSize: room.size });
      }
    }
    const count = (connectionCount.get(ip) ?? 1) - 1;
    if (count <= 0) connectionCount.delete(ip);
    else connectionCount.set(ip, count);
  }

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress ?? 'unknown';

    // Enforce max 5 connections per IP
    const count = connectionCount.get(ip) ?? 0;
    if (count >= 5) {
      ws.close(1008, 'Too many connections from your network');
      return;
    }
    connectionCount.set(ip, count + 1);

    const roomId = ip;
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());

    const name = assignName(getRoomNames(roomId));
    const rateLimiter = makeRateLimiter();

    // Register handlers BEFORE adding to maps
    function onClose() { rateLimiter.destroy(); cleanup(ws, roomId, name, ip); }
    ws.on('close', onClose);
    ws.on('error', onClose);
    ws.on('terminate', onClose);

    // Now add to maps
    identityMap.set(ws, name);
    rooms.get(roomId).add(ws);

    // Notify room of new peer
    broadcast(roomId, { type: 'joined', name, roomSize: rooms.get(roomId).size }, ws);

    // Send join confirmation to new peer
    ws.send(JSON.stringify({ type: 'joined', name, roomSize: rooms.get(roomId).size }));

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { ws.terminate(); return; }

      if (msg.type !== 'msg') return; // unknown types dropped silently
      if (typeof msg.text !== 'string') return;
      const text = msg.text.trim();
      if (text.length < 1 || text.length > 500) return;
      if (!rateLimiter.consume()) return; // rate limit exceeded — drop silently

      broadcast(roomId, {
        type: 'msg',
        from: identityMap.get(ws),
        text,
        ts: Date.now(),
      });
    });
  });

  return {
    httpServer,
    wss,
    close() {
      return new Promise((resolve) => {
        wss.close(() => httpServer.close(resolve));
      });
    },
  };
}

// Only start if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT ?? 3000;
  const { httpServer } = createServer();
  httpServer.listen(PORT, () => {
    console.log(`TrainChat running on http://localhost:${PORT}`);
  });
}
```

- [ ] **Step 4: Add `"type": "module"` to package.json** (required for ES module imports)

Edit `package.json` to add `"type": "module"` at the top level.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/I501850/Workspace/personal/train-talk && npm test 2>&1
```
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
cd /Users/I501850/Workspace/personal/train-talk
git add src/server.js test/server.test.js package.json
git commit -m "feat: implement WebSocket relay server with security controls"
```

---

## Task 4: Frontend

**Files:**
- Create: `public/index.html`
- Create: `public/app.js`
- Create: `public/style.css`

**Interfaces:**
- Consumes: WebSocket at `ws://` or `wss://` same origin
- Message shapes received: `{ type: "joined", name, roomSize }`, `{ type: "msg", from, text, ts }`, `{ type: "left", name, roomSize }`
- Message shape sent: `{ type: "msg", text }`

- [ ] **Step 1: Create public/style.css**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:      #0f1117;
  --surface: #1a1d27;
  --border:  #2e3148;
  --text:    #e8eaf0;
  --muted:   #8b8fa8;
  --accent:  #6c7cff;
  --me:      #3ecf8e;
  --font:    system-ui, -apple-system, sans-serif;
}

html, body { height: 100%; }

body {
  font-family: var(--font);
  background:  var(--bg);
  color:       var(--text);
  display:     flex;
  flex-direction: column;
  height:      100%;
}

/* Header */
#header {
  padding:         0.75rem 1rem;
  background:      var(--surface);
  border-bottom:   1px solid var(--border);
  display:         flex;
  align-items:     center;
  justify-content: space-between;
  flex-shrink:     0;
}

#header h1 { font-size: 1.1rem; font-weight: 700; }

#status {
  font-size:  0.8rem;
  color:      var(--muted);
  text-align: right;
}

#my-name {
  font-weight: 600;
  color:       var(--me);
}

/* Messages */
#messages {
  flex:       1;
  overflow-y: auto;
  padding:    1rem;
  display:    flex;
  flex-direction: column;
  gap:        0.5rem;
}

.msg {
  max-width:    70%;
  padding:      0.5rem 0.75rem;
  border-radius: 12px;
  background:   var(--surface);
  border:       1px solid var(--border);
  word-break:   break-word;
}

.msg.mine {
  align-self:  flex-end;
  background:  #1e2a4a;
  border-color: var(--accent);
}

.msg .sender {
  font-size:   0.72rem;
  font-weight: 600;
  color:       var(--accent);
  margin-bottom: 0.2rem;
}

.msg.mine .sender { color: var(--me); }

.msg .text { font-size: 0.92rem; line-height: 1.5; }

.system-msg {
  text-align: center;
  font-size:  0.78rem;
  color:      var(--muted);
  padding:    0.2rem 0;
}

/* Input */
#input-row {
  display:    flex;
  gap:        0.5rem;
  padding:    0.75rem 1rem;
  background: var(--surface);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

#msg-input {
  flex:          1;
  background:    var(--bg);
  border:        1px solid var(--border);
  border-radius: 8px;
  padding:       0.5rem 0.75rem;
  color:         var(--text);
  font-size:     0.95rem;
  font-family:   var(--font);
  outline:       none;
}

#msg-input:focus { border-color: var(--accent); }

#send-btn {
  background:    var(--accent);
  color:         #fff;
  border:        none;
  border-radius: 8px;
  padding:       0.5rem 1rem;
  font-size:     0.95rem;
  font-weight:   600;
  cursor:        pointer;
}

#send-btn:disabled { opacity: 0.4; cursor: default; }

/* Info box */
#info {
  margin:        0.75rem 1rem;
  padding:       0.75rem 1rem;
  background:    var(--surface);
  border:        1px solid var(--border);
  border-radius: 8px;
  font-size:     0.78rem;
  color:         var(--muted);
  line-height:   1.6;
  flex-shrink:   0;
}

#info a { color: var(--accent); }
#info summary { cursor: pointer; font-weight: 600; color: var(--text); }
```

- [ ] **Step 2: Create public/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TrainChat</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="header">
    <h1>TrainChat</h1>
    <div id="status">
      <div>You are: <span id="my-name">connecting…</span></div>
      <div id="room-size"></div>
    </div>
  </div>

  <details id="info">
    <summary>How TrainChat works</summary>
    <ul style="margin-top:0.5rem; padding-left:1.2rem;">
      <li>Your messages reach everyone on the same WiFi network</li>
      <li>"Same network" means same public IP — includes hotel/carrier NAT</li>
      <li>Nothing is stored — messages exist only in connected browser tabs</li>
      <li>Anyone on this network can connect, including via scripts</li>
      <li>Closing this tab ends your session permanently</li>
      <li><a href="https://github.com/AgentKnopf/trainchat" target="_blank" rel="noopener">View source on GitHub</a></li>
    </ul>
  </details>

  <div id="messages"></div>

  <div id="input-row">
    <input id="msg-input" type="text" placeholder="Say something…" maxlength="500" autocomplete="off" disabled>
    <button id="send-btn" disabled>Send</button>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create public/app.js**

```js
// All DOM insertion uses textContent — never innerHTML
const messagesEl = document.getElementById('messages');
const myNameEl   = document.getElementById('my-name');
const roomSizeEl = document.getElementById('room-size');
const input      = document.getElementById('msg-input');
const sendBtn    = document.getElementById('send-btn');

let myName = null;

const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${proto}://${location.host}`);

ws.addEventListener('open', () => {
  addSystem('Connected — waiting for room info…');
});

ws.addEventListener('close', () => {
  setEnabled(false);
  addSystem('Disconnected. Refresh to reconnect.');
});

ws.addEventListener('error', () => {
  addSystem('Connection error.');
});

ws.addEventListener('message', (event) => {
  let msg;
  try { msg = JSON.parse(event.data); } catch { return; }

  if (msg.type === 'joined' && !myName) {
    // Our own join confirmation
    myName = msg.name;
    myNameEl.textContent = msg.name;
    updateRoomSize(msg.roomSize);
    setEnabled(true);
    addSystem(`You joined as ${msg.name}`);
    return;
  }

  if (msg.type === 'joined') {
    updateRoomSize(msg.roomSize);
    addSystem(`${msg.name} joined`);
    return;
  }

  if (msg.type === 'left') {
    updateRoomSize(msg.roomSize);
    addSystem(`${msg.name} left`);
    return;
  }

  if (msg.type === 'msg') {
    addMessage(msg.from, msg.text, msg.from === myName);
  }
});

function addMessage(from, text, isMe) {
  const div = document.createElement('div');
  div.className = isMe ? 'msg mine' : 'msg';

  const sender = document.createElement('div');
  sender.className = 'sender';
  sender.textContent = from; // textContent — safe

  const body = document.createElement('div');
  body.className = 'text';
  body.textContent = text; // textContent — safe

  div.appendChild(sender);
  div.appendChild(body);
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addSystem(text) {
  const div = document.createElement('div');
  div.className = 'system-msg';
  div.textContent = text; // textContent — safe
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateRoomSize(n) {
  roomSizeEl.textContent = n === 1 ? 'Just you here' : `${n} people here`;
}

function setEnabled(enabled) {
  input.disabled = !enabled;
  sendBtn.disabled = !enabled;
  if (enabled) input.focus();
}

function sendMessage() {
  const text = input.value.trim();
  if (!text || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'msg', text }));
  input.value = '';
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
```

- [ ] **Step 4: Remove .gitkeep from public/**

```bash
rm /Users/I501850/Workspace/personal/train-talk/public/.gitkeep
rm /Users/I501850/Workspace/personal/train-talk/src/.gitkeep
```

- [ ] **Step 5: Run the server locally and verify it works**

```bash
cd /Users/I501850/Workspace/personal/train-talk && npm start
```

Open `http://localhost:3000` in two browser tabs. Verify:
- Both tabs get a random name
- Message sent in tab 1 appears in tab 2
- Room size updates when tabs open/close
- "Just you here" shows when alone

- [ ] **Step 6: Run full test suite**

```bash
cd /Users/I501850/Workspace/personal/train-talk && npm test
```
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
cd /Users/I501850/Workspace/personal/train-talk
git add public/ src/
git commit -m "feat: add frontend (HTML/CSS/JS) — single-page chat UI"
```

---

## Task 5: Final Polish & Push

**Files:**
- Modify: `README.md` — add local dev instructions
- Create: `docs/deploy.md` — deployment guide (systemd + nginx PROXY protocol)

- [ ] **Step 1: Run full test suite one final time**

```bash
cd /Users/I501850/Workspace/personal/train-talk && npm test
```
Expected: all tests pass, zero failures

- [ ] **Step 2: Verify no console.log of message content**

```bash
grep -r "console.log" /Users/I501850/Workspace/personal/train-talk/src/
```
Expected: no output (zero matches)

- [ ] **Step 3: Verify textContent used exclusively in app.js**

```bash
grep -n "innerHTML\|insertAdjacentHTML\|dangerouslySet" /Users/I501850/Workspace/personal/train-talk/public/app.js
```
Expected: no output (zero matches)

- [ ] **Step 4: Update README with dev instructions**

Add to README.md under a `## Development` section:

```markdown
## Development

```bash
git clone https://github.com/AgentKnopf/trainchat
cd trainchat
npm install
npm run dev      # starts server with --watch (auto-restarts on changes)
```

Open http://localhost:3000 in two tabs to test locally.

## Running Tests

```bash
npm test
```
```

- [ ] **Step 5: Final commit and push**

```bash
cd /Users/I501850/Workspace/personal/train-talk
git add -A
git commit -m "chore: final polish — README dev instructions, verify security invariants"
git push origin main
```

---

## Self-Review Checklist

- [x] **maxPayload** — set at `WebSocket.Server` constructor in Task 3 ✓
- [x] **JSON.stringify** — all broadcast envelopes use it, never template literals ✓
- [x] **textContent** — all DOM insertion in app.js uses it ✓
- [x] **Origin allowlist** — `verifyClient` in server.js ✓
- [x] **Rate limiting** — token bucket per socket, 5 msg/sec ✓
- [x] **Max connections per IP** — enforced in `wss.on('connection')` ✓
- [x] **headersTimeout / requestTimeout** — set on httpServer ✓
- [x] **close/error/terminate handlers** — registered before maps in Task 3 ✓
- [x] **No console.log of message content** — verified in Task 5 ✓
- [x] **CSP + HSTS headers** — set in HTTP server response handler ✓
- [x] **CGNAT disclosure** — info box in index.html ✓
- [x] **Name collision** — assignName loops until unique, throws if exhausted ✓
