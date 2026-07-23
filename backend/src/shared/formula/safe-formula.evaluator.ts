// ============================================================================
// Safe formula evaluator — no eval(), HR rules only (RULE-001)
// Supports: arithmetic, comparison, IF/THEN/ELSE, MIN, MAX, ROUND, CEIL, FLOOR, SUM, AVG
// ============================================================================

export class FormulaEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaEvaluationError';
  }
}

type Token =
  | { type: 'number'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

const FUNCTIONS = new Set(['IF', 'THEN', 'ELSE', 'MIN', 'MAX', 'ROUND', 'CEIL', 'FLOOR', 'SUM', 'AVG']);
const COMPARISON_OPS = new Set(['>', '<', '>=', '<=', '=', '==', '!=']);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input.replace(/\s+/g, ' ').trim();

  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ') { i++; continue; }
    if (ch === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma' }); i++; continue; }
    if ('+-*/'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    if ('><=!'.includes(ch)) {
      let op = ch;
      if (i + 1 < s.length && s[i + 1] === '=') { op += '='; i++; }
      else if (ch === '=' && i + 1 < s.length && s[i + 1] === '=') { op = '=='; i++; }
      tokens.push({ type: 'op', value: op });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = ch;
      i++;
      while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i]; i++; }
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let ident = ch;
      i++;
      while (i < s.length && /[A-Za-z0-9_]/.test(s[i])) { ident += s[i]; i++; }
      tokens.push({ type: 'ident', value: ident });
      continue;
    }
    throw new FormulaEvaluationError(`Unexpected character "${ch}" at position ${i}`);
  }
  return tokens;
}

export function validateFormulaExpression(expression: string): { valid: boolean; error?: string } {
  try {
    tokenize(expression);
    evaluateFormula(expression, {});
    return { valid: true };
  } catch (err) {
    if (err instanceof FormulaEvaluationError && err.message.startsWith('Missing variable')) {
      return { valid: true };
    }
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function evaluateFormula(
  expression: string,
  variables: Record<string, number | boolean | string | null | undefined>,
): number {
  const tokens = tokenize(expression);
  let pos = 0;

  function peek(): Token | undefined { return tokens[pos]; }
  function consume(): Token {
    const t = tokens[pos++];
    if (!t) throw new FormulaEvaluationError('Unexpected end of expression');
    return t;
  }

  function resolveVar(name: string): number {
    if (FUNCTIONS.has(name.toUpperCase())) return NaN;
    const val = variables[name];
    if (val === undefined || val === null) {
      throw new FormulaEvaluationError(`Missing variable: ${name}`);
    }
    if (typeof val === 'boolean') return val ? 1 : 0;
    if (typeof val === 'string') {
      const n = parseFloat(val);
      if (Number.isNaN(n)) throw new FormulaEvaluationError(`Variable ${name} is not numeric`);
      return n;
    }
    return val;
  }

  function tokenValue(t: Token): string | number {
    if (t.type === 'number' || t.type === 'ident' || t.type === 'op') return t.value;
    throw new FormulaEvaluationError('Unexpected token');
  }

  function parsePrimary(): number {
    const t = peek();
    if (!t) throw new FormulaEvaluationError('Expected value');

    if (t.type === 'number') { consume(); return t.value; }
    if (t.type === 'ident') {
      const name = tokenValue(consume()) as string;
      const upper = name.toUpperCase();
      if (upper === 'IF') return parseIf();
      if (['MIN', 'MAX', 'ROUND', 'CEIL', 'FLOOR', 'SUM', 'AVG'].includes(upper)) {
        return parseFunction(upper);
      }
      return resolveVar(name);
    }
    if (t.type === 'lparen') {
      consume();
      const val = parseComparison();
      if (peek()?.type !== 'rparen') throw new FormulaEvaluationError('Expected )');
      consume();
      return val;
    }
    if (t.type === 'op' && t.value === '-') {
      consume();
      return -parsePrimary();
    }
    throw new FormulaEvaluationError(`Unexpected token: ${JSON.stringify(t)}`);
  }

  function parseFunction(name: string): number {
    if (peek()?.type !== 'lparen') throw new FormulaEvaluationError(`Expected ( after ${name}`);
    consume();
    const args: number[] = [];
    if (peek()?.type !== 'rparen') {
      args.push(parseComparison());
      while (peek()?.type === 'comma') {
        consume();
        args.push(parseComparison());
      }
    }
    if (peek()?.type !== 'rparen') throw new FormulaEvaluationError(`Expected ) after ${name}`);
    consume();

    switch (name) {
      case 'MIN': return Math.min(...args);
      case 'MAX': return Math.max(...args);
      case 'ROUND': return Math.round(args[0] ?? 0);
      case 'CEIL': return Math.ceil(args[0] ?? 0);
      case 'FLOOR': return Math.floor(args[0] ?? 0);
      case 'SUM': return args.reduce((a, b) => a + b, 0);
      case 'AVG': return args.length ? args.reduce((a, b) => a + b, 0) / args.length : 0;
      default: throw new FormulaEvaluationError(`Unknown function: ${name}`);
    }
  }

  function parseIf(): number {
    const condition = parseComparison();
    const thenTok = peek();
    if (thenTok?.type !== 'ident' || thenTok.value.toUpperCase() !== 'THEN') {
      throw new FormulaEvaluationError('IF requires THEN');
    }
    consume();
    const thenVal = parseComparison();
    const elseTok = peek();
    if (elseTok?.type !== 'ident' || elseTok.value.toUpperCase() !== 'ELSE') {
      throw new FormulaEvaluationError('IF requires ELSE');
    }
    consume();
    const elseVal = parseComparison();
    return condition !== 0 ? thenVal : elseVal;
  }

  function parseMulDiv(): number {
    let left = parsePrimary();
    while (peek()?.type === 'op' && (peek() as { type: 'op'; value: string }).value.match(/^[\*/]$/)) {
      const op = tokenValue(consume()) as string;
      const right = parsePrimary();
      if (op === '*') left *= right;
      else {
        if (right === 0) throw new FormulaEvaluationError('Divide by zero');
        left /= right;
      }
    }
    return left;
  }

  function parseAddSub(): number {
    let left = parseMulDiv();
    while (peek()?.type === 'op' && (peek() as { type: 'op'; value: string }).value.match(/^[+-]$/)) {
      const op = tokenValue(consume()) as string;
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseComparison(): number {
    let left = parseAddSub();
    while (peek()?.type === 'op' && COMPARISON_OPS.has((peek() as { type: 'op'; value: string }).value)) {
      const op = tokenValue(consume()) as string;
      const right = parseAddSub();
      let result = false;
      switch (op) {
        case '>': result = left > right; break;
        case '<': result = left < right; break;
        case '>=': result = left >= right; break;
        case '<=': result = left <= right; break;
        case '=':
        case '==': result = left === right; break;
        case '!=': result = left !== right; break;
        default: throw new FormulaEvaluationError(`Unknown operator: ${op}`);
      }
      left = result ? 1 : 0;
    }
    return left;
  }

  const result = parseComparison();
  if (pos < tokens.length) {
    throw new FormulaEvaluationError('Unexpected tokens after expression');
  }
  if (!Number.isFinite(result)) {
    throw new FormulaEvaluationError('Result is not a finite number');
  }
  return result;
}
