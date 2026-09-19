import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildHistoryAttribution } from '../public/history.js';

test('buildHistoryAttribution: uses stored isMe when confirmedName is null', () => {
  const history = [
    { from: 'Jolly Raven', text: 'hi', ts: 1, isMe: true },
    { from: 'Calm Fox', text: 'hey', ts: 2, isMe: false },
  ];
  const result = buildHistoryAttribution(history, null);
  assert.equal(result[0].isMe, true);
  assert.equal(result[1].isMe, false);
});

test('buildHistoryAttribution: derives isMe from confirmedName when provided', () => {
  const history = [
    { from: 'Jolly Raven', text: 'hi', ts: 1, isMe: false }, // wrong stored value
    { from: 'Calm Fox', text: 'hey', ts: 2, isMe: true },    // wrong stored value
  ];
  const result = buildHistoryAttribution(history, 'Jolly Raven');
  assert.equal(result[0].isMe, true);  // name matches — correctly mine
  assert.equal(result[1].isMe, false); // name doesn't match — correctly not mine
});

test('buildHistoryAttribution: filters out entries missing from or text', () => {
  const history = [
    { from: 'Jolly Raven', text: 'valid', ts: 1, isMe: true },
    { from: null, text: 'missing from', ts: 2, isMe: false },
    { from: 'Calm Fox', text: null, ts: 3, isMe: false },
    { text: 'no from key', ts: 4 },
  ];
  const result = buildHistoryAttribution(history, null);
  assert.equal(result.length, 1);
  assert.equal(result[0].text, 'valid');
});

test('buildHistoryAttribution: returns empty array for empty history', () => {
  const result = buildHistoryAttribution([], null);
  assert.deepEqual(result, []);
});

test('buildHistoryAttribution: old entries without isMe field default to false when confirmedName is null', () => {
  const history = [{ from: 'Jolly Raven', text: 'old entry', ts: 1 }];
  const result = buildHistoryAttribution(history, null);
  assert.equal(result[0].isMe, false);
});
