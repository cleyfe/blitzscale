import { NEUTRAL, WATER } from '@marketfront/engine-api/game/GameMap';
import type { GameImpl } from '@marketfront/engine/game/GameImpl';

const COURT_GOLD: [number, number, number] = [241, 196, 15];

/** Draws the market map at one pixel per area, scaled up by CSS. */
export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: ImageData;
  private drawnKey = '';

  constructor(private game: GameImpl) {
    const { width, height } = game.map;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.className = 'map';
    this.ctx = this.canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(width, height);
  }

  draw(): void {
    const g = this.game;
    // Companies being sued get a blinking gold border while the case runs.
    const blink = Math.floor(performance.now() / 400) % 2 === 0;
    const inCourt = new Set(blink ? g.lawsuits.map((l) => l.defendant) : []);
    const key = `${g.ownershipVersion}|${[...inCourt].join(',')}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;

    const px = this.image.data;
    const { demand } = g.map;
    for (let i = 0; i < g.owner.length; i++) {
      const o = g.owner[i];
      let r: number, gr: number, b: number;
      if (o === WATER) {
        [r, gr, b] = [18, 32, 52];
      } else {
        // Denser markets (cities) are drawn brighter.
        const shade = Math.min(1, (demand[i] - 1) / 3.5);
        if (o === NEUTRAL) {
          const v = 62 + shade * 70;
          [r, gr, b] = [v, v + 4, v + 8];
        } else {
          const [cr, cg, cb] = g.companies[o].color;
          const k = 0.55 + shade * 0.45;
          [r, gr, b] = [cr * k, cg * k, cb * k];
          if (g.companies[o].border.has(i)) {
            if (inCourt.has(o)) [r, gr, b] = COURT_GOLD;
            // Your own border glows; rivals' borders are darker.
            else if (o === 0) [r, gr, b] = [cr + (255 - cr) * 0.45, cg + (255 - cg) * 0.45, cb + (255 - cb) * 0.45];
            else [r, gr, b] = [cr * 0.5, cg * 0.5, cb * 0.5];
          }
        }
      }
      const p = i * 4;
      px[p] = r;
      px[p + 1] = gr;
      px[p + 2] = b;
      px[p + 3] = 255;
    }
    this.ctx.putImageData(this.image, 0, 0);
  }

  /** Converts a mouse event to an area index, or -1 when outside the map. */
  tileAt(ev: MouseEvent): number {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((ev.clientX - rect.left) / rect.width) * this.game.map.width);
    const y = Math.floor(((ev.clientY - rect.top) / rect.height) * this.game.map.height);
    if (x < 0 || y < 0 || x >= this.game.map.width || y >= this.game.map.height) return -1;
    return y * this.game.map.width + x;
  }
}
