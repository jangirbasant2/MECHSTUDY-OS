/**
 * A small, safe mathematical expression evaluator.
 *
 * Exam Mode lets a student type a numerical answer as an expression
 * ("2*(3+4)", "sqrt(144)", "9.81*0.5") instead of a bare number, and the
 * grading code needs to evaluate the official key the same way. Both run on
 * input that may come from imported PDF text, so this module deliberately
 * implements its own tokenizer + recursive-descent parser and never touches
 * `eval`, `new Function`, or any property access on parsed input.
 *
 * Supported:
 *   numbers      42  3.5  1e-3  .5
 *   operators    +  -  *  /  ^  % (modulo)  unary -
 *   grouping     ( ... )
 *   constants    pi, e
 *   functions    sin cos tan asin acos atan sinh cosh tanh
 *                sqrt cbrt abs exp ln log log10 log2 floor ceil round
 *                min max sign deg rad
 *
 * Not supported, by design: identifiers other than the whitelist, indexing,
 * method calls, assignment, commas outside function calls, statement
 * separators. Anything else is a parse error, not a runtime.
 *
 * Guards: input length, token count and recursion depth are capped, and a
 * non-finite result is rejected, so the parser cannot be used as a
 * denial-of-service vector or to produce Infinity/NaN answers.
 */

export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; error: string; position?: number };

const MAX_INPUT_LENGTH = 200;
const MAX_TOKENS = 200;
const MAX_DEPTH = 24;

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

const FUNCTIONS: Record<string, { arity: number; fn: (...args: number[]) => number }> = {
  sin: { arity: 1, fn: x => Math.sin(x) },
  cos: { arity: 1, fn: x => Math.cos(x) },
  tan: { arity: 1, fn: x => Math.tan(x) },
  asin: { arity: 1, fn: x => Math.asin(x) },
  acos: { arity: 1, fn: x => Math.acos(x) },
  atan: { arity: 1, fn: x => Math.atan(x) },
  sinh: { arity: 1, fn: x => Math.sinh(x) },
  cosh: { arity: 1, fn: x => Math.cosh(x) },
  tanh: { arity: 1, fn: x => Math.tanh(x) },
  sqrt: { arity: 1, fn: x => Math.sqrt(x) },
  cbrt: { arity: 1, fn: x => Math.cbrt(x) },
  abs: { arity: 1, fn: x => Math.abs(x) },
  exp: { arity: 1, fn: x => Math.exp(x) },
  ln: { arity: 1, fn: x => Math.log(x) },
  log: { arity: 1, fn: x => Math.log10(x) }, // engineering convention: log = log10
  log10: { arity: 1, fn: x => Math.log10(x) },
  log2: { arity: 1, fn: x => Math.log2(x) },
  floor: { arity: 1, fn: x => Math.floor(x) },
  ceil: { arity: 1, fn: x => Math.ceil(x) },
  round: { arity: 1, fn: x => Math.round(x) },
  sign: { arity: 1, fn: x => Math.sign(x) },
  deg: { arity: 1, fn: x => (x * 180) / Math.PI },
  rad: { arity: 1, fn: x => (x * Math.PI) / 180 },
  min: { arity: 2, fn: (a, b) => Math.min(a, b) },
  max: { arity: 2, fn: (a, b) => Math.max(a, b) },
};

type Token =
  | { kind: 'number'; value: number; pos: number }
  | { kind: 'name'; value: string; pos: number }
  | { kind: 'op'; value: string; pos: number }
  | { kind: 'lparen'; pos: number }
  | { kind: 'rparen'; pos: number }
  | { kind: 'comma'; pos: number }
  | { kind: 'eof'; pos: number };

class ParseError extends Error {
  position: number;

  constructor(message: string, position: number) {
    super(message);
    this.name = 'ParseError';
    this.position = position;
  }
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const c = src[i];

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }

    // number: digits with optional fraction and exponent
    if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      const start = i;
      while (i < src.length && src[i] >= '0' && src[i] <= '9') i++;
      if (src[i] === '.') {
        i++;
        while (i < src.length && src[i] >= '0' && src[i] <= '9') i++;
      }
      if (src[i] === 'e' || src[i] === 'E') {
        const save = i;
        i++;
        if (src[i] === '+' || src[i] === '-') i++;
        if (src[i] >= '0' && src[i] <= '9') {
          while (i < src.length && src[i] >= '0' && src[i] <= '9') i++;
        } else {
          i = save; // "2e" is the number 2 followed by the constant e
        }
      }
      const raw = src.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new ParseError(`Invalid number "${raw}"`, start);
      tokens.push({ kind: 'number', value, pos: start });
      continue;
    }

    // identifier: function name or constant
    if (/[a-zA-Z_]/.test(c)) {
      const start = i;
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) i++;
      tokens.push({ kind: 'name', value: src.slice(start, i).toLowerCase(), pos: start });
      continue;
    }

    if (c === '(') { tokens.push({ kind: 'lparen', pos: i }); i++; continue; }
    if (c === ')') { tokens.push({ kind: 'rparen', pos: i }); i++; continue; }
    if (c === ',') { tokens.push({ kind: 'comma', pos: i }); i++; continue; }

    if ('+-*/^%'.includes(c)) { tokens.push({ kind: 'op', value: c, pos: i }); i++; continue; }

    // Unicode operators students actually type.
    if (c === '×') { tokens.push({ kind: 'op', value: '*', pos: i }); i++; continue; }
    if (c === '÷') { tokens.push({ kind: 'op', value: '/', pos: i }); i++; continue; }
    if (c === '−') { tokens.push({ kind: 'op', value: '-', pos: i }); i++; continue; }
    if (c === 'π') { tokens.push({ kind: 'name', value: 'pi', pos: i }); i++; continue; }
    // Superscript two/three (x², x³) mean square/cube.
    if (c === '²') { tokens.push({ kind: 'op', value: '^', pos: i }, { kind: 'number', value: 2, pos: i }); i++; continue; }
    if (c === '³') { tokens.push({ kind: 'op', value: '^', pos: i }, { kind: 'number', value: 3, pos: i }); i++; continue; }

    throw new ParseError(`Unexpected character "${c}"`, i);
  }

  tokens.push({ kind: 'eof', pos: src.length });
  if (tokens.length > MAX_TOKENS + 1) throw new ParseError('Expression is too long', 0);
  return tokens;
}

class Parser {
  private index = 0;
  private depth = 0;
  private tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token { return this.tokens[this.index]; }
  private next(): Token { return this.tokens[this.index++]; }
  /** Tokens the parser has not consumed yet (used to detect trailing input). */
  rest(): Token[] { return this.tokens.slice(this.index); }

  private expectRparen(): void {
    const t = this.next();
    if (t.kind !== 'rparen') throw new ParseError('Expected ")"', t.pos);
  }

  private enter(pos: number): void {
    if (++this.depth > MAX_DEPTH) throw new ParseError('Expression nesting is too deep', pos);
  }

  private leave(): void { this.depth--; }

  /** expression := term (('+' | '-') term)* */
  parseExpression(): number {
    let value = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (t.kind === 'op' && (t.value === '+' || t.value === '-')) {
        this.next();
        const rhs = this.parseTerm();
        value = t.value === '+' ? value + rhs : value - rhs;
      } else {
        return value;
      }
    }
  }

  /** term := unary ((* | / | %) unary)* */
  private parseTerm(): number {
    let value = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.kind === 'op' && (t.value === '*' || t.value === '/' || t.value === '%')) {
        this.next();
        const rhs = this.parseUnary();
        if (t.value === '*') value *= rhs;
        else if (t.value === '/') {
          if (rhs === 0) throw new ParseError('Division by zero', t.pos);
          value /= rhs;
        } else {
          if (rhs === 0) throw new ParseError('Modulo by zero', t.pos);
          value %= rhs;
        }
      } else {
        return value;
      }
    }
  }

  /** unary := ('-' | '+') unary | power */
  private parseUnary(): number {
    const t = this.peek();
    if (t.kind === 'op' && (t.value === '-' || t.value === '+')) {
      this.next();
      this.enter(t.pos);
      const value = this.parseUnary();
      this.leave();
      return t.value === '-' ? -value : value;
    }
    return this.parsePower();
  }

  /** power := primary ('^' unary)?   — right-associative: 2^3^2 = 2^9 */
  private parsePower(): number {
    const base = this.parsePrimary();
    const t = this.peek();
    if (t.kind === 'op' && t.value === '^') {
      this.next();
      this.enter(t.pos);
      const exponent = this.parseUnary(); // allows 2^-1
      this.leave();
      const value = Math.pow(base, exponent);
      if (Number.isNaN(value)) throw new ParseError('Invalid exponentiation (a^b is not defined here)', t.pos);
      return value;
    }
    return base;
  }

  /** primary := number | constant | function '(' expression (',' expression)* ')' | '(' expression ')' */
  private parsePrimary(): number {
    const t = this.next();

    if (t.kind === 'number') return t.value;

    if (t.kind === 'lparen') {
      this.enter(t.pos);
      const value = this.parseExpression();
      this.leave();
      this.expectRparen();
      return value;
    }

    if (t.kind === 'name') {
      // Own-property checks only: FUNCTIONS['constructor'] and
      // FUNCTIONS['__proto__'] would otherwise resolve through the prototype
      // chain and be treated as known functions.
      const def = Object.hasOwn(FUNCTIONS, t.value) ? FUNCTIONS[t.value] : undefined;
      if (def) {
        const open = this.next();
        if (open.kind !== 'lparen') throw new ParseError(`"${t.value}" must be called as ${t.value}(...)`, open.pos);
        this.enter(t.pos);
        const args: number[] = [this.parseExpression()];
        while (this.peek().kind === 'comma') {
          this.next();
          if (args.length >= def.arity) throw new ParseError(`"${t.value}" takes at most ${def.arity} argument(s)`, t.pos);
          args.push(this.parseExpression());
        }
        this.leave();
        this.expectRparen();
        if (args.length !== def.arity) {
          throw new ParseError(`"${t.value}" takes exactly ${def.arity} argument(s)`, t.pos);
        }
        return def.fn(...args);
      }
      const constant = Object.hasOwn(CONSTANTS, t.value) ? CONSTANTS[t.value] : undefined;
      if (constant !== undefined) return constant;
      throw new ParseError(`Unknown name "${t.value}"`, t.pos);
    }

    if (t.kind === 'eof') throw new ParseError('Expression ended unexpectedly', t.pos);
    if (t.kind === 'op') throw new ParseError(`Unexpected operator "${t.value}"`, t.pos);
    if (t.kind === 'comma') throw new ParseError('Unexpected comma', t.pos);
    throw new ParseError('Unexpected token', t.pos);
  }
}

/**
 * Evaluates a mathematical expression.
 *
 * Returns `{ ok: false }` for every problem — malformed input, unknown names,
 * division by zero, non-finite results — instead of throwing, so callers can
 * show the message to the student without a try/catch.
 */
export function evaluateExpression(input: string): EvalResult {
  if (typeof input !== 'string') return { ok: false, error: 'Not a string' };

  // Students paste "25%" for percent or "= 42" from a worksheet: normalize
  // before tokenizing rather than rejecting an otherwise correct answer.
  // Only a "%" glued to a number is percent (50% → 50/100); a spaced "%"
  // between two numbers stays modulo (7 % 2 → 1), which is the only reading
  // that keeps both meanings usable.
  const src = input
    .trim()
    .replace(/^(?:ans(?:wer)?\s*(?::|=))\s*/i, '')
    .replace(/(\d+(?:\.\d+)?)%/g, '($1/100)')
    .trim();
  const normalized = src;

  if (!normalized) return { ok: false, error: 'Empty expression' };
  if (normalized.length > MAX_INPUT_LENGTH) {
    return { ok: false, error: `Expression is longer than ${MAX_INPUT_LENGTH} characters` };
  }

  let tokens: Token[];
  try {
    tokens = tokenize(normalized);
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message, position: e.position };
    throw e;
  }

  try {
    const parser = new Parser(tokens);
    const value = parser.parseExpression();
    // Reject trailing garbage: "2 3", "4 +)", "sqrt(4) foo".
    const leftover = parser.rest().filter(tk => tk.kind !== 'eof');
    if (leftover.length > 0) {
      return { ok: false, error: 'Unexpected extra input', position: leftover[0].pos };
    }
    if (!Number.isFinite(value)) {
      return { ok: false, error: 'Result is not a finite number' };
    }
    return { ok: true, value };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message, position: e.position };
    throw e;
  }
}

/**
 * Evaluates a plain number or an expression, returning `null` when the input
 * does not evaluate to a finite number. Used when grading a numerical answer.
 */
export function evaluateToNumber(input: string): number | null {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (!trimmed) return null;

  // Fast path: a bare number (the overwhelmingly common case) — also
  // accepts thousands separators as typed by students.
  const bare = Number(trimmed.replace(/,/g, ''));
  if (Number.isFinite(bare) && /^[-+]?[0-9,.]+$/.test(trimmed)) return bare;

  const res = evaluateExpression(trimmed);
  return res.ok ? res.value : null;
}

/** True when the input parses as a finite expression or number. */
export function isEvaluable(input: string): boolean {
  return evaluateToNumber(input) !== null;
}
