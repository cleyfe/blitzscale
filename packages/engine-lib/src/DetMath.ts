// Math helpers that give bit-identical results on every JS engine.
// The built-in exponential, power and log functions may differ between
// browsers; + − × ÷ and sqrt never do.

/** e^x via (1 + x/2^k)^(2^k): only multiplications, so it is deterministic. */
export function exp(x: number): number {
  if (x < -40) return 0;
  let r = 1 + x / 1024;
  for (let i = 0; i < 10; i++) r *= r;
  return r;
}

/** base^n for a non-negative integer n. */
export function powInt(base: number, n: number): number {
  let r = 1;
  for (let i = 0; i < n; i++) r *= base;
  return r;
}
