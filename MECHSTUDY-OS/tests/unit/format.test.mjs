import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bytes, clock, hours, initials, parseDbDate, pct, seconds, statusLabel, truncate,
} from '../../src/renderer/src/lib/format.ts';

test('bytes formats file sizes and tolerates missing values', () => {
  assert.equal(bytes(null), '—');
  assert.equal(bytes(undefined), '—');
  assert.equal(bytes(0), '0 B');
  assert.equal(bytes(1023), '1023 B');
  assert.equal(bytes(2048), '2.0 KB');
  assert.equal(bytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(bytes(2.5 * 1024 * 1024 * 1024), '2.50 GB');
});

test('seconds and hours read as study time', () => {
  assert.equal(seconds(0), '0s');
  assert.equal(seconds(45), '45s');
  assert.equal(seconds(90), '1m 30s');
  assert.equal(seconds(3600), '1h 0m');
  assert.equal(seconds(5430), '1h 30m');
  assert.equal(hours(30), '30s');
  assert.equal(hours(3600), '1.0 h');
  assert.equal(seconds(-10), '0s', 'negative durations are clamped');
});

test('clock renders a stopwatch', () => {
  assert.equal(clock(0), '00:00');
  assert.equal(clock(65), '01:05');
  assert.equal(clock(3725), '1:02:05');
  assert.equal(clock(-5), '00:00');
});

test('parseDbDate treats SQLite timestamps as UTC', () => {
  // datetime('now') stores UTC with no zone marker. Parsing it as local time
  // would shift every timestamp by the UTC offset (the "Today 07:47 AM" bug).
  const stored = parseDbDate('2026-10-27 07:47:00');
  assert.equal(stored.toISOString(), '2026-10-27T07:47:00.000Z');

  const iso = parseDbDate('2026-10-27T07:47:00.000Z');
  assert.equal(iso.toISOString(), '2026-10-27T07:47:00.000Z');

  const offset = parseDbDate('2026-10-27T07:47:00+05:30');
  assert.equal(offset.toISOString(), '2026-10-27T02:17:00.000Z');
});

test('parseDbDate keeps bare calendar dates on the same day', () => {
  const date = parseDbDate('2026-10-27');
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 9, 'October');
  assert.equal(date.getDate(), 27);
  assert.equal(date.getHours(), 0);
});

test('parseDbDate rejects empty and malformed values', () => {
  assert.equal(parseDbDate(null), null);
  assert.equal(parseDbDate(undefined), null);
  assert.equal(parseDbDate(''), null);
  assert.equal(parseDbDate('   '), null);
  assert.equal(parseDbDate('not a date'), null);
});

test('small helpers behave predictably', () => {
  assert.equal(pct(1, 4), 25);
  assert.equal(pct(0, 0), 0);
  assert.equal(initials('Basant Jangir'), 'BJ');
  assert.equal(initials('mechstudy'), 'M');
  assert.equal(truncate('Engineering Thermodynamics', 10), 'Engineeri…');
  assert.equal(truncate('short', 10), 'short');
  assert.equal(statusLabel('needs_revision'), 'Needs revision');
  assert.equal(statusLabel('in_progress'), 'in progress');
});
