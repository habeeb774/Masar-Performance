/**
 * Tiny, sandboxed arithmetic expression language for custom KPI formulas.
 * No `eval`/`Function` — a recursive-descent parser over a fixed grammar:
 *
 *   expr     := or
 *   or       := and ( "||" and )*
 *   and      := cmp ( "&&" cmp )*
 *   cmp      := add ( ("<"|"<="|">"|">="|"=="|"!=") add )?
 *   add      := mul ( ("+"|"-") mul )*
 *   mul      := unary ( ("*"|"/"|"%") unary )*
 *   unary    := ("-"|"!") unary | pow
 *   pow      := primary ( "^" unary )?
 *   primary  := number | ident | ident "(" args ")" | "(" expr ")"
 */

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "(" }
  | { t: ")" }
  | { t: "," };

type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

export class FormulaError extends Error {}

const MAX_LENGTH = 500;

const FUNCTIONS: Record<string, { min: number; max: number; fn: (...a: number[]) => number }> = {
  min: { min: 1, max: 20, fn: (...a) => Math.min(...a) },
  max: { min: 1, max: 20, fn: (...a) => Math.max(...a) },
  abs: { min: 1, max: 1, fn: (a) => Math.abs(a) },
  floor: { min: 1, max: 1, fn: (a) => Math.floor(a) },
  ceil: { min: 1, max: 1, fn: (a) => Math.ceil(a) },
  round: {
    min: 1,
    max: 2,
    fn: (a, d = 0) => {
      const f = 10 ** Math.max(0, Math.min(6, Math.trunc(d)));
      return Math.round(a * f) / f;
    },
  },
  clamp: { min: 3, max: 3, fn: (x, lo, hi) => Math.min(Math.max(x, lo), hi) },
  if: { min: 3, max: 3, fn: (c, a, b) => (c ? a : b) },
};

function tokenize(src: string): Token[] {
  if (src.length > MAX_LENGTH) throw new FormulaError("المعادلة طويلة جدًا");
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) throw new FormulaError(`رقم غير صالح: ${src.slice(i, j)}`);
      out.push({ t: "num", v });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "==", "!=", "&&", "||"].includes(two)) {
      out.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/%^<>!".includes(ch)) {
      out.push({ t: "op", v: ch });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")" || ch === ",") {
      out.push({ t: ch } as Token);
      i++;
      continue;
    }
    throw new FormulaError(`رمز غير مدعوم: ${ch}`);
  }
  return out;
}

function parse(tokens: Token[]): Node {
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => {
    const tk = peek();
    return tk?.t === "op" && tk.v === v;
  };
  const expect = (t: Token["t"]) => {
    const tk = tokens[pos];
    if (!tk || tk.t !== t) throw new FormulaError("صيغة المعادلة غير صحيحة");
    pos++;
    return tk;
  };

  const expr = (): Node => or();
  const or = (): Node => {
    let a = and();
    while (isOp("||")) {
      pos++;
      a = { k: "bin", op: "||", a, b: and() };
    }
    return a;
  };
  const and = (): Node => {
    let a = cmp();
    while (isOp("&&")) {
      pos++;
      a = { k: "bin", op: "&&", a, b: cmp() };
    }
    return a;
  };
  const cmp = (): Node => {
    const a = add();
    const tk = peek();
    if (tk?.t === "op" && ["<", "<=", ">", ">=", "==", "!="].includes(tk.v)) {
      pos++;
      return { k: "bin", op: tk.v, a, b: add() };
    }
    return a;
  };
  const add = (): Node => {
    let a = mul();
    for (;;) {
      const tk = peek();
      if (tk?.t === "op" && (tk.v === "+" || tk.v === "-")) {
        pos++;
        a = { k: "bin", op: tk.v, a, b: mul() };
      } else return a;
    }
  };
  const mul = (): Node => {
    let a = unary();
    for (;;) {
      const tk = peek();
      if (tk?.t === "op" && (tk.v === "*" || tk.v === "/" || tk.v === "%")) {
        pos++;
        a = { k: "bin", op: tk.v, a, b: unary() };
      } else return a;
    }
  };
  const unary = (): Node => {
    const tk = peek();
    if (tk?.t === "op" && (tk.v === "-" || tk.v === "!")) {
      pos++;
      return { k: "un", op: tk.v, a: unary() };
    }
    return pow();
  };
  const pow = (): Node => {
    const a = primary();
    if (isOp("^")) {
      pos++;
      return { k: "bin", op: "^", a, b: unary() };
    }
    return a;
  };
  const primary = (): Node => {
    const tk = tokens[pos++];
    if (!tk) throw new FormulaError("نهاية غير متوقعة للمعادلة");
    if (tk.t === "num") return { k: "num", v: tk.v };
    if (tk.t === "(") {
      const e = expr();
      expect(")");
      return e;
    }
    if (tk.t === "id") {
      if (peek()?.t === "(") {
        pos++;
        const args: Node[] = [];
        if (peek()?.t !== ")") {
          args.push(expr());
          while (peek()?.t === ",") {
            pos++;
            args.push(expr());
          }
        }
        expect(")");
        const def = FUNCTIONS[tk.v];
        if (!def) throw new FormulaError(`دالة غير معروفة: ${tk.v}`);
        if (args.length < def.min || args.length > def.max) throw new FormulaError(`عدد معاملات غير صحيح للدالة ${tk.v}`);
        return { k: "call", fn: tk.v, args };
      }
      return { k: "var", name: tk.v };
    }
    throw new FormulaError("صيغة المعادلة غير صحيحة");
  };

  const root = expr();
  if (pos !== tokens.length) throw new FormulaError("رموز زائدة في نهاية المعادلة");
  return root;
}

function evaluate(node: Node, vars: Record<string, number>): number {
  switch (node.k) {
    case "num":
      return node.v;
    case "var": {
      if (!(node.name in vars)) throw new FormulaError(`متغير غير معروف: ${node.name}`);
      return vars[node.name];
    }
    case "un": {
      const a = evaluate(node.a, vars);
      return node.op === "-" ? -a : a ? 0 : 1;
    }
    case "call": {
      if (node.fn === "if") {
        const c = evaluate(node.args[0], vars);
        return c ? evaluate(node.args[1], vars) : evaluate(node.args[2], vars);
      }
      return FUNCTIONS[node.fn].fn(...node.args.map((a) => evaluate(a, vars)));
    }
    case "bin": {
      const a = evaluate(node.a, vars);
      if (node.op === "&&") return a ? (evaluate(node.b, vars) ? 1 : 0) : 0;
      if (node.op === "||") return a ? 1 : evaluate(node.b, vars) ? 1 : 0;
      const b = evaluate(node.b, vars);
      switch (node.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return b === 0 ? 0 : a / b;
        case "%":
          return b === 0 ? 0 : a % b;
        case "^":
          return a ** b;
        case "<":
          return a < b ? 1 : 0;
        case "<=":
          return a <= b ? 1 : 0;
        case ">":
          return a > b ? 1 : 0;
        case ">=":
          return a >= b ? 1 : 0;
        case "==":
          return a === b ? 1 : 0;
        case "!=":
          return a !== b ? 1 : 0;
      }
      throw new FormulaError(`عامل غير مدعوم: ${node.op}`);
    }
  }
}

export function compileFormula(src: string) {
  const ast = parse(tokenize(src));
  return (vars: Record<string, number>) => {
    const v = evaluate(ast, vars);
    if (!Number.isFinite(v)) throw new FormulaError("نتيجة المعادلة غير صالحة");
    return v;
  };
}

export function evaluateFormula(src: string, vars: Record<string, number>): number {
  return compileFormula(src)(vars);
}

/** Validate a formula against a set of allowed variable names. */
export function validateFormula(src: string, allowedVars: string[]): { ok: true } | { ok: false; error: string } {
  try {
    const sample = Object.fromEntries(allowedVars.map((v) => [v, 1]));
    evaluateFormula(src, sample);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "معادلة غير صالحة" };
  }
}
