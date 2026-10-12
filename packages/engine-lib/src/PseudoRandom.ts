// Deterministic PRNG (mulberry32) so a seed always replays the same match.
export class PseudoRandom {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, maxExclusive: number): number {
    return Math.floor(this.range(min, maxExclusive));
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}
