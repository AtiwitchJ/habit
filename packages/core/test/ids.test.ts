import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uuidv7 } from '../src/ids.ts';

test('uuidv7 has v7 and variant bits', () => {
  assert.match(uuidv7(), /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('uuidv7 sorts by timestamp', () => {
  assert.ok(uuidv7(1_000) < uuidv7(2_000));
  assert.ok(uuidv7(1_700_000_000_000) < uuidv7(1_700_000_000_001));
});

test('uuidv7 is unique within one millisecond', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => uuidv7(5)));
  assert.equal(ids.size, 1000);
});
