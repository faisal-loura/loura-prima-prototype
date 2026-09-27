/**
 * Ordinary arithmetic for agents. Quantities and prices are calculated by
 * software, not estimated by the model. Supports + - * / and parentheses.
 */
export function calculate(expression: string): number {
  const src = expression.replace(/,/g, "").replace(/\s+/g, "");
  let i = 0;

  const peek = () => src[i];
  const expect = (ch: string) => {
    if (src[i] !== ch) throw new Error(`Expected “${ch}” at position ${i}`);
    i++;
  };

  function number(): number {
    const start = i;
    while (i < src.length && /[0-9.]/.test(src[i])) i++;
    if (start === i) throw new Error(`Expected a number at position ${i}`);
    const n = Number(src.slice(start, i));
    if (!Number.isFinite(n)) throw new Error("Invalid number");
    return n;
  }

  function factor(): number {
    if (peek() === "-") {
      i++;
      return -factor();
    }
    if (peek() === "(") {
      i++;
      const v = expr();
      expect(")");
      return v;
    }
    return number();
  }

  function term(): number {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = src[i++];
      const r = factor();
      if (op === "/" && r === 0) throw new Error("Division by zero");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }

  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  const result = expr();
  if (i !== src.length) throw new Error(`Unexpected “${src[i]}” at position ${i}`);
  return Math.round(result * 1e6) / 1e6;
}
