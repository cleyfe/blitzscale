import { CONFIG } from './config';
import type { Game } from './game';
import { neighbors4, NEUTRAL, WATER } from './map';
import type { Company, Personality } from './types';

interface Persona {
  maxSales: number; // highest share of staff in sales
  salesRatio: number; // sales reps wanted per operations employee while growing
  reserveDays: number; // days of fixed costs kept as a cash buffer
  borrows: boolean;
  aggression: number; // 0..1 appetite for stealing rivals' customers
}

const PERSONAS: Record<Personality, Persona> = {
  discounter: { maxSales: 0.7, salesRatio: 1.0, reserveDays: 8, borrows: true, aggression: 1 },
  balanced: { maxSales: 0.6, salesRatio: 0.7, reserveDays: 12, borrows: true, aggression: 0.6 },
  premium: { maxSales: 0.5, salesRatio: 0.5, reserveDays: 18, borrows: false, aggression: 0.3 },
};

/** Simple rule-based company AI, called once per game day. */
export function botDecide(g: Game, c: Company): void {
  const p = PERSONAS[c.personality];
  const s = CONFIG.staff;
  const fixedPerDay = c.pnl.salaries + c.pnl.rent + c.pnl.interest;
  const reserve = Math.max(5_000, fixedPerDay * p.reserveDays);

  // 1. Staff split: enough operations to serve every customer, the rest sells.
  const branchCap = c.buildings.branch * CONFIG.buildings.branch.capacity;
  const opsNeeded = Math.ceil(Math.max(0, c.tiles * 1.08 - branchCap) / s.tilesPerOps);
  const share = c.employees > 0 ? 1 - opsNeeded / c.employees : 0;
  g.setSalesShare(c, Math.min(p.maxSales, Math.max(0.05, share)));

  // Growth only makes sense while there are customers worth winning.
  const frontier = scanFrontier(g, c);
  const canGrow = frontier.neutral > 0 || frontier.cheapestRival <= rivalThreshold(p);
  const salesWanted = canGrow ? Math.max(4, Math.ceil(opsNeeded * p.salesRatio)) : 2;
  const wanted = opsNeeded + salesWanted;
  const staff = c.employees + g.traineeCount(c);

  // 2. Cash management.
  if (p.borrows && canGrow && c.cash < reserve && c.debt + CONFIG.bank.loanChunk <= g.maxDebt(c) * 0.6) g.borrow(c);
  if (c.debt > 0 && c.cash > reserve * 2 + CONFIG.bank.loanChunk) g.repay(c);
  if (staff > wanted * 1.3 && c.employees > 6) {
    g.fire(c, Math.ceil((staff - wanted) * 0.25));
  } else if (c.cash < reserve * 0.25 && c.avgProfit < 0 && c.employees > 6) {
    g.fire(c, Math.ceil(c.employees * 0.1));
  }

  // 3. Buildings, when they pay for themselves.
  const b = CONFIG.buildings;
  const varCost = c.customers * CONFIG.variableCostPerCustomer * g.variableCostMult(c);
  if (varCost * (1 - b.warehouse.variableCostMult) > b.warehouse.rentPerDay * 2.5 && c.cash > b.warehouse.cost + reserve) {
    g.build(c, 'warehouse');
  } else if (g.coverage(c) < 1 && c.tiles > 80 && c.cash > b.branch.cost + reserve) {
    g.build(c, 'branch');
  } else if (g.salesStaff(c) >= 20 && c.buildings.adAgency < 3 && c.cash > b.adAgency.cost + reserve * 1.5) {
    g.build(c, 'adAgency');
  }

  // 4. Hiring, from surplus cash only, up to the staff the business needs.
  if (staff < wanted && c.cash > reserve + s.hireCost * 2) {
    const affordable = Math.floor((c.cash - reserve) / (s.hireCost + s.salaryPerDay * 20));
    const n = Math.min(affordable, wanted - staff, Math.ceil(c.employees * 0.2) + 1);
    if (n > 0) g.hire(c, n);
  }

  // 5. Sales campaigns.
  if (c.push >= Math.max(5, g.maxPush(c) * 0.3)) launchBotCampaign(g, c, p, frontier);
}

const rivalThreshold = (p: Persona) => CONFIG.sales.rivalTileCost * (0.5 + p.aggression * 0.9);

interface Frontier {
  neutral: number;
  bestNeutral: number;
  cheapestRival: number; // push per customer
  cheapestRivalTile: number;
}

function scanFrontier(g: Game, c: Company): Frontier {
  const sample = new Map<number, number>();
  const nb: number[] = [];
  const f: Frontier = { neutral: 0, bestNeutral: -1, cheapestRival: Infinity, cheapestRivalTile: -1 };
  let bestDemand = -1;
  let seen = 0;
  for (const tile of c.border) {
    for (const n of neighbors4(g.map, tile, nb)) {
      const o = g.owner[n];
      if (o === WATER || o === c.id) continue;
      if (o === NEUTRAL) {
        f.neutral++;
        if (seen++ < 60) {
          const d = g.map.demand[n] + g.rng.next();
          if (d > bestDemand) {
            bestDemand = d;
            f.bestNeutral = n;
          }
        }
      } else if (!sample.has(o) || g.rng.next() < 0.1) {
        sample.set(o, n);
      }
    }
  }
  for (const [owner, tile] of sample) {
    const cost = g.tileCost(c, owner, tile) / g.map.demand[tile];
    if (cost < f.cheapestRival) {
      f.cheapestRival = cost;
      f.cheapestRivalTile = tile;
    }
  }
  return f;
}

function launchBotCampaign(g: Game, c: Company, p: Persona, f: Frontier): void {
  let target = -1;
  if (f.neutral > 8 || (f.neutral > 0 && f.cheapestRivalTile < 0)) target = f.bestNeutral;
  else if (f.cheapestRival <= rivalThreshold(p)) target = f.cheapestRivalTile;
  else if (f.neutral > 0) target = f.bestNeutral;
  if (target >= 0) g.launchCampaign(c, target);
}
