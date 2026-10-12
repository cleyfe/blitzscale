import type { GameMap } from '@marketfront/engine-api/game/GameMap';
import { CONFIG } from '../configuration/Config';
import { exp } from '../DetMath';
import type { PseudoRandom } from '../PseudoRandom';

function valueNoise(rng: PseudoRandom, w: number, h: number, cell: number): Float32Array {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const grid = new Float32Array(gw * gh).map(() => rng.next());
  const out = new Float32Array(w * h);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / cell;
      const gy = y / cell;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = smooth(gx - x0);
      const ty = smooth(gy - y0);
      const a = grid[y0 * gw + x0];
      const b = grid[y0 * gw + x0 + 1];
      const c = grid[(y0 + 1) * gw + x0];
      const d = grid[(y0 + 1) * gw + x0 + 1];
      out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}

/** A landmass of customer areas, with dense cities and some water. */
export function generateMap(rng: PseudoRandom): GameMap {
  const { width: w, height: h, cities } = CONFIG.map;
  const n1 = valueNoise(rng, w, h, 18);
  const n2 = valueNoise(rng, w, h, 7);
  const isWater = new Uint8Array(w * h);
  const demand = new Float32Array(w * h);

  const cityList = Array.from({ length: cities }, () => ({
    x: rng.range(10, w - 10),
    y: rng.range(8, h - 8),
    r: rng.range(5, 11),
    peak: rng.range(2, 4),
  }));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Fade to water near the edges so the market reads like a landmass.
      const ex = Math.min(x, w - 1 - x) / 12;
      const ey = Math.min(y, h - 1 - y) / 8;
      const edge = Math.min(1, ex, ey);
      const land = (n1[i] * 0.7 + n2[i] * 0.3) * (0.55 + 0.45 * edge);
      if (land < 0.33) {
        isWater[i] = 1;
        continue;
      }
      let d = 1;
      for (const c of cityList) {
        const dist2 = (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y);
        d += c.peak * exp(-dist2 / (2 * c.r * c.r));
      }
      demand[i] = Math.round(d * 4) / 4;
    }
  }
  return { width: w, height: h, demand, isWater };
}

export function neighbors4(map: GameMap, i: number, out: number[]): number[] {
  out.length = 0;
  const x = i % map.width;
  const y = (i / map.width) | 0;
  if (x > 0) out.push(i - 1);
  if (x < map.width - 1) out.push(i + 1);
  if (y > 0) out.push(i - map.width);
  if (y < map.height - 1) out.push(i + map.width);
  return out;
}
