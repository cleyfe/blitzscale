import { NEUTRAL, WATER } from '@marketfront/engine-api/game/GameMap';
import type { GameImpl } from '@marketfront/engine/game/GameImpl';
import type { ClientGameRunner } from './ClientGameRunner';
import type { MapRenderer } from './render/MapRenderer';

/** Map clicks launch campaigns; hovering explains what an area is worth. */
export class InputHandler {
  constructor(
    private client: ClientGameRunner,
    private renderer: MapRenderer,
    private tooltip: HTMLElement,
    private onSpeedKey: (speed: number) => void,
  ) {}

  attach(): () => void {
    const canvas = this.renderer.canvas;
    const onClick = (ev: MouseEvent) => {
      const tile = this.renderer.tileAt(ev);
      if (tile >= 0) this.client.send({ type: 'campaign', companyId: 0, tile });
    };
    const onMove = (ev: MouseEvent) => {
      const tile = this.renderer.tileAt(ev);
      if (tile < 0) return;
      this.tooltip.textContent = describeTile(this.client.game, tile);
      const rect = canvas.parentElement!.getBoundingClientRect();
      this.tooltip.style.left = `${ev.clientX - rect.left + 14}px`;
      this.tooltip.style.top = `${ev.clientY - rect.top + 14}px`;
      this.tooltip.style.display = 'block';
    };
    const onLeave = () => (this.tooltip.style.display = 'none');
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
      const speeds: Record<string, number> = { ' ': 0, '1': 1, '2': 2, '3': 4 };
      if (ev.key in speeds) {
        ev.preventDefault();
        this.onSpeedKey(ev.key === ' ' && this.client.speed === 0 ? 1 : speeds[ev.key]);
      }
    };
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }
}

export function describeTile(g: GameImpl, tile: number): string {
  const o = g.owner[tile];
  if (o === WATER) return 'Water: no customers';
  const d = g.map.demand[tile];
  const who = o === NEUTRAL ? 'Untapped market' : o === 0 ? 'Your customers' : g.companies[o].name;
  let s = `${who} · ${d.toFixed(2)} customers`;
  if (o !== 0) s += ` · costs ${g.tileCost(g.player, o, tile).toFixed(1)} push`;
  return s;
}
