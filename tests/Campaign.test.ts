import { describe, expect, it } from 'vitest';
import { act, lastMessage, neutralNeighbour, quietSetup, runDays } from './util/Setup';

describe('sales campaigns', () => {
  it('win neighbouring untapped customers with sales push', () => {
    const r = quietSetup();
    const me = r.game.player;
    act(r, { type: 'setSalesShare', companyId: 0, share: 0.6 });
    runDays(r, 20);
    const tiles = me.tiles;
    const pushBefore = me.push;
    act(r, { type: 'campaign', companyId: 0, tile: neutralNeighbour(r) });
    expect(me.push).toBeLessThan(pushBefore);
    runDays(r, 2);
    expect(me.tiles).toBeGreaterThan(tiles);
  });

  it('are rejected for markets that are not adjacent', () => {
    const r = quietSetup();
    const far = r.game.companies[3].border.values().next().value!;
    r.game.player.push = 100;
    act(r, { type: 'campaign', companyId: 0, tile: far });
    expect(r.game.player.push).toBeGreaterThanOrEqual(100); // nothing spent
    expect(lastMessage(r)).toMatch(/next to yours/);
  });

  it('find cheap, well-served rivals harder to beat than high-priced ones', () => {
    const r = quietSetup();
    const g = r.game;
    const rival = g.companies[1];
    const tile = rival.border.values().next().value!;
    rival.price = 'low';
    const cheap = g.tileCost(g.player, rival.id, tile);
    rival.price = 'high';
    const pricey = g.tileCost(g.player, rival.id, tile);
    expect(cheap).toBeGreaterThan(pricey);
  });
});
