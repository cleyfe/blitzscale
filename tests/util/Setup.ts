import { NEUTRAL } from '@marketfront/engine-api/game/GameMap';
import type { Intent } from '@marketfront/engine-api/Intents';
import { CONFIG } from '@marketfront/engine-lib/configuration/Config';
import { defaultCompanies } from '@marketfront/engine-lib/configuration/Companies';
import { neighbors4 } from '@marketfront/engine-lib/game/GameMap';
import { GameRunner } from '@marketfront/engine/GameRunner';

export function setup(seed = 42, allBots = false): GameRunner {
  return new GameRunner(seed, defaultCompanies('Tester', allBots));
}

/** A game where every company is passive (no bots acting), for precise rule tests. */
export function quietSetup(seed = 42): GameRunner {
  return new GameRunner(
    seed,
    defaultCompanies('Tester').map((c) => ({ ...c, isBot: false })),
  );
}

export function runDays(r: GameRunner, days: number): void {
  for (let i = 0; i < days * CONFIG.ticksPerDay && !r.game.result; i++) r.executeNextTick();
}

/** Sends an intent and runs the tick that applies it. */
export function act(r: GameRunner, intent: Intent): void {
  r.addIntent(intent);
  r.executeNextTick();
}

export function neutralNeighbour(r: GameRunner, companyId = 0): number {
  const g = r.game;
  for (const b of g.companies[companyId].border) {
    for (const n of neighbors4(g.map, b, [])) if (g.owner[n] === NEUTRAL) return n;
  }
  return -1;
}

export function lastMessage(r: GameRunner, companyId = 0): string | undefined {
  return [...r.game.log].reverse().find((l) => l.recipient === companyId)?.text;
}
