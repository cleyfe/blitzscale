import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { Game } from '../src/game/game';
import { neighbors4, NEUTRAL } from '../src/game/map';
import { defaultCompanies } from '../src/game/setup';

const newGame = (seed = 42) => new Game(seed, defaultCompanies('Tester'));
const runDays = (g: Game, days: number) => {
  for (let i = 0; i < days * CONFIG.ticksPerDay && !g.result; i++) g.step();
};
const neutralNeighbour = (g: Game) => {
  for (const b of g.player.border) {
    for (const n of neighbors4(g.map, b, [])) if (g.owner[n] === NEUTRAL) return n;
  }
  return -1;
};

describe('setup', () => {
  it('gives every company a starting territory', () => {
    const g = newGame();
    for (const c of g.companies) {
      expect(c.tiles).toBeGreaterThan(10);
      expect(c.cash).toBe(CONFIG.start.cash);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = newGame(7);
    const b = newGame(7);
    runDays(a, 120);
    runDays(b, 120);
    expect(Array.from(a.owner)).toEqual(Array.from(b.owner));
    expect(a.companies.map((c) => c.cash)).toEqual(b.companies.map((c) => c.cash));
  });
});

describe('profit and loss', () => {
  it('adds daily profit to cash', () => {
    const g = newGame();
    const me = g.player;
    runDays(g, 1);
    const before = me.cash;
    runDays(g, 1);
    const p = me.pnl;
    expect(p.profit).toBeCloseTo(p.revenue - p.variableCost - p.salaries - p.rent - p.interest);
    expect(me.cash - before).toBeCloseTo(p.profit, 0);
  });

  it('charges salary for trainees who do not work yet', () => {
    const g = newGame();
    const me = g.player;
    expect(g.hire(me, 5)).toBeNull();
    expect(me.cash).toBe(CONFIG.start.cash - 5 * CONFIG.staff.hireCost);
    runDays(g, 1);
    expect(me.employees).toBe(CONFIG.start.employees);
    expect(me.pnl.salaries).toBe((CONFIG.start.employees + 5) * CONFIG.staff.salaryPerDay);
    runDays(g, CONFIG.staff.trainingDays);
    expect(me.employees).toBe(CONFIG.start.employees + 5);
  });

  it('only serves customers the operations team has capacity for', () => {
    const g = newGame();
    const me = g.player;
    g.setSalesShare(me, 1);
    runDays(g, 1);
    expect(g.capacity(me)).toBe(0);
    expect(me.pnl.revenue).toBe(0);
  });

  it('charges interest on debt', () => {
    const g = newGame();
    const me = g.player;
    expect(g.borrow(me)).toBeNull();
    runDays(g, 1);
    expect(me.pnl.interest).toBeCloseTo((me.debt * CONFIG.bank.interestPerYear) / 365);
  });
});

describe('growth', () => {
  it('wins neighbouring untapped customers with sales push', () => {
    const g = newGame();
    const me = g.player;
    g.setSalesShare(me, 0.6);
    runDays(g, 20);
    const tiles = me.tiles;
    const target = neutralNeighbour(g);
    expect(target).toBeGreaterThanOrEqual(0);
    expect(g.launchCampaign(me, target)).toBeNull();
    runDays(g, 2);
    expect(me.tiles).toBeGreaterThan(tiles);
  });

  it('rejects campaigns into markets that are not adjacent', () => {
    const g = newGame();
    const far = g.companies[3].border.values().next().value!;
    g.player.push = 100;
    expect(g.launchCampaign(g.player, far)).toMatch(/next to yours/);
  });

  it('makes cheap, well-served rivals harder to win than high-priced ones', () => {
    const g = newGame();
    const rival = g.companies[1];
    const tile = rival.border.values().next().value!;
    g.setPrice(rival, 'low');
    const cheap = g.tileCost(g.player, rival.id, tile);
    g.setPrice(rival, 'high');
    const pricey = g.tileCost(g.player, rival.id, tile);
    expect(cheap).toBeGreaterThan(pricey);
  });

  it('caps the number of each building', () => {
    const g = newGame();
    const me = g.player;
    me.cash = 1e9;
    for (let i = 0; i < CONFIG.buildings.warehouse.max; i++) expect(g.build(me, 'warehouse')).toBeNull();
    expect(g.build(me, 'warehouse')).toMatch(/maximum/);
  });
});

describe('ending the game', () => {
  it('bankrupts a company that stays out of cash', () => {
    const g = newGame();
    const me = g.player;
    me.cash = -1e7;
    runDays(g, CONFIG.bankruptcyGraceDays + 1);
    expect(me.alive).toBe(false);
    expect(me.tiles).toBe(0);
    expect(g.result?.reason).toBe('playerBankrupt');
  });

  it('declares the first unicorn the winner', () => {
    const g = newGame();
    g.player.cash = CONFIG.valuation.unicorn + 1e6;
    g.step();
    expect(g.result).toMatchObject({ winnerId: 0, reason: 'unicorn' });
  });

  it('values a company on profit, not just cash', () => {
    const g = newGame();
    const me = g.player;
    me.avgProfit = 1000;
    const v = g.valuation(me);
    expect(v.earnings).toBe(1000 * 365 * CONFIG.valuation.earningsMultiple);
    expect(v.total).toBeCloseTo(v.cash - v.debt + v.assets + v.earnings);
  });

  it('finishes a bot-only match', () => {
    const g = new Game(3, defaultCompanies('Bot', true));
    runDays(g, CONFIG.matchDays + 1);
    expect(g.result).not.toBeNull();
  });
});
