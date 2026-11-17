import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateExpression, evaluateToNumber, isEvaluable } from '../../src/shared/mathExpr.ts';

function value(input) {
  const res = evaluateExpression(input);
  assert.equal(res.ok, true, `expected "${input}" to evaluate, got: ${res.ok ? '' : res.error}`);
  return res.value;
}

function error(input) {
  const res = evaluateExpression(input);
  assert.equal(res.ok, false, `expected "${input}" to fail, but it returned ${res.ok ? res.value : ''}`);
  return res.error;
}

test('arithmetic precedence and parentheses', () => {
  assert.equal(value('2+3*4'), 14);
  assert.equal(value('(2+3)*4'), 20);
  assert.equal(value('10-4-3'), 3);        // left-associative
  assert.equal(value('100/10/2'), 5);
  assert.equal(value('2*3+4*5'), 26);
  assert.equal(value('1+2*3^2'), 19);      // ^ binds tighter than *
});

test('exponentiation is right-associative and binds tighter than unary minus', () => {
  assert.equal(value('2^3^2'), 512);       // 2^(3^2), not (2^3)^2
  assert.equal(value('-2^2'), -4);         // -(2^2)
  assert.equal(value('2^-1'), 0.5);
  assert.equal(value('(-2)^2'), 4);
});

test('unary minus and plus', () => {
  assert.equal(value('-5+3'), -2);
  assert.equal(value('--5'), 5);
  assert.equal(value('+3'), 3);
  assert.equal(value('2*-3'), -6);
  assert.equal(value('-2*3'), -6);
});

test('decimals, scientific notation and separators', () => {
  assert.equal(value('3.5'), 3.5);
  assert.equal(value('.5'), 0.5);
  assert.equal(value('1e-3'), 0.001);
  assert.equal(value('2.5E2'), 250);
  // A truncated exponent is rejected rather than silently read as 2*e:
  // guessing here would mark a student's answer against the wrong number.
  assert.match(error('2e'), /extra input|unexpected/i);
  assert.equal(value('2*e'), 2 * Math.E);
  assert.equal(evaluateToNumber('1,000'), 1000);
  assert.equal(evaluateToNumber('  42 '), 42);
});

test('functions and constants', () => {
  assert.equal(value('sqrt(16)'), 4);
  assert.equal(value('abs(-7)'), 7);
  assert.equal(value('max(3,9)'), 9);
  assert.equal(value('min(3,9)'), 3);
  assert.equal(value('floor(2.7)'), 2);
  assert.equal(value('ceil(2.1)'), 3);
  assert.equal(value('round(2.5)'), 3);
  assert.equal(value('ln(e)'), 1);
  assert.equal(value('log(1000)'), 3);     // log = log10 (engineering convention)
  assert.equal(value('log2(8)'), 3);
  assert.equal(value('exp(0)'), 1);
  assert.equal(value('sin(0)'), 0);
  assert.equal(value('pi'), Math.PI);
  assert.equal(value('2*pi'), 2 * Math.PI);
  assert.ok(Math.abs(value('cos(0)') - 1) < 1e-12);
  assert.ok(Math.abs(value('sqrt(2)') - Math.SQRT2) < 1e-12);
});

test('percent glued to a number means /100, spaced % stays modulo', () => {
  assert.equal(value('50%'), 0.5);
  assert.equal(value('200*15%'), 30);
  assert.equal(value('7 % 2'), 1);
});

test('unicode operators students actually type', () => {
  assert.equal(value('6×7'), 42);
  assert.equal(value('8÷2'), 4);
  assert.equal(value('5−2'), 3);
  assert.equal(value('π'), Math.PI);
  assert.equal(value('3²'), 9);
  assert.equal(value('2³'), 8);
});

test('"answer:" prefixes are stripped', () => {
  assert.equal(value('answer: 42'), 42);
  assert.equal(value('Answer = 42'), 42);
});

test('malformed input reports an error instead of throwing', () => {
  assert.match(error(''), /empty/i);
  assert.match(error('   '), /empty/i);
  assert.match(error('2+'), /unexpected|\) /i);
  assert.match(error('(2+3'), /\)/i);
  assert.match(error('2 3'), /extra input/i);
  assert.match(error('sqrt4'), /unknown name|must be called/i);
  assert.match(error('foo(1)'), /unknown name/i);
  assert.match(error('constructor'), /unknown name/i);
  assert.match(error('2++'), /unexpected/i);
  assert.match(error('*3'), /unexpected/i);
  assert.match(error('min(1)'), /exactly 2/i);
  assert.match(error('max(1,2,3)'), /at most 2/i);
  assert.match(error('1/0'), /division by zero/i);
  assert.match(error('5 % 0'), /modulo by zero/i);
  assert.match(error('sqrt(-1)'), /not a finite number/i);
});

test('hostile input is rejected, never executed', () => {
  // Nothing in this module reaches eval/Function, but the guards below are
  // what stop a pathological input from hanging the grading path.
  assert.equal(error('a'.repeat(500)), 'Expression is longer than 200 characters');
  assert.match(error('process.exit(1)'), /unknown name|unexpected character/i);
  assert.match(error('this.constructor'), /unknown name|unexpected character/i);
  assert.match(error('__proto__'), /unknown name/i);
  assert.match(error('globalThis'), /unknown name/i);
  const deep = '('.repeat(40) + '1' + ')'.repeat(40);
  assert.match(error(deep), /too deep/i);
});

test('evaluateToNumber returns null for anything un-evaluable', () => {
  assert.equal(evaluateToNumber(''), null);
  assert.equal(evaluateToNumber('abc'), null);
  assert.equal(evaluateToNumber('1/0'), null);
  assert.equal(evaluateToNumber(null), null);
  assert.equal(evaluateToNumber(undefined), null);
  assert.equal(evaluateToNumber('2*(3+4)'), 14);
  assert.equal(isEvaluable('sqrt(9)'), true);
  assert.equal(isEvaluable('nope'), false);
});

test('every result is a finite number', () => {
  for (const input of ['1e308*10', 'ln(0)', 'log(0)', '1e308^2']) {
    const res = evaluateExpression(input);
    if (res.ok) assert.ok(Number.isFinite(res.value), `${input} produced ${res.value}`);
    else assert.ok(typeof res.error === 'string' && res.error.length > 0);
  }
});
