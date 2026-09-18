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
