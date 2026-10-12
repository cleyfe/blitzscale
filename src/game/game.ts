import { CONFIG, type BuildingType, type PriceLevel } from './config';
import { generateMap, neighbors4, NEUTRAL, WATER, type GameMap } from './map';
import { Rng } from './rng';
import type {
  ActiveEvent,
  Campaign,
  Company,
  GameEventKind,
  GameResult,
  LogEntry,
  Personality,
  Pnl,
  ValuationBreakdown,
} from './types';
import { botDecide } from './bots';

export interface CompanySpec {
  name: string;
  color: [number, number, number];
  isBot: boolean;
  personality?: Personality;
}

export const EVENT_INFO: Record<GameEventKind, { title: string; days: number; text: string }> = {
  recession: { title: 'Recession', days: 60, text: 'Customers spend less: revenue −30%.' },
  supplierHike: { title: 'Supplier price hike', days: 45, text: 'Variable costs ×2.' },
  boom: { title: 'Consumer boom', days: 60, text: 'Customers spend more: revenue +25%.' },
};

const emptyPnl = (): Pnl => ({ revenue: 0, variableCost: 0, salaries: 0, rent: 0, interest: 0, profit: 0 });

export class Game {
  readonly map: GameMap;
  readonly owner: Int16Array;
  readonly companies: Company[] = [];
  readonly rng: Rng;
  readonly log: LogEntry[] = [];
  tick = 0;
  events: ActiveEvent[] = [];
  nextEventDay: number = CONFIG.events.firstDay;
  result: GameResult | null = null;
  /** Bumped whenever tile ownership changes, so renderers can skip redraws. */
  ownershipVersion = 0;

  private nb: number[] = [];
  private nb2: number[] = [];
  private stamp: Uint32Array;
  private stampId = 1;

  constructor(seed: number, specs: CompanySpec[]) {
    this.rng = new Rng(seed);
    this.map = generateMap(this.rng);
    const size = this.map.width * this.map.height;
    this.owner = new Int16Array(size).fill(NEUTRAL);
    this.stamp = new Uint32Array(size);
    for (let i = 0; i < size; i++) if (this.map.isWater[i]) this.owner[i] = WATER;

    specs.forEach((s, id) => {
      this.companies.push({
        id,
        name: s.name,
        color: s.color,
        isBot: s.isBot,
        personality: s.personality ?? 'balanced',
        alive: true,
        cash: CONFIG.start.cash,
        debt: 0,
        employees: CONFIG.start.employees,
        trainees: [],
        salesShare: CONFIG.start.salesShare,
        price: s.personality === 'discounter' ? 'low' : s.personality === 'premium' ? 'high' : 'medium',
        buildings: { branch: 0, warehouse: 0, adAgency: 0 },
        buildingSpend: 0,
        push: 0,
        campaigns: [],
        tiles: 0,
        customers: 0,
        border: new Set(),
        pnl: emptyPnl(),
        avgProfit: 0,
        churnCarry: 0,
        negativeCashDays: 0,
        peakTiles: 0,
        peakValuation: 0,
        bankruptDay: null,
      });
    });
    this.placeSpawns();
    this.addLog('Market opens. Grab customers before your rivals do!', 'info');
  }

  // ---------- time ----------

  get day(): number {
    return this.tick / CONFIG.ticksPerDay;
  }

  get player(): Company {
    return this.companies[0];
  }

  // ---------- derived numbers ----------

  salesStaff(c: Company): number {
    return Math.round(c.employees * c.salesShare);
  }

  opsStaff(c: Company): number {
    return c.employees - this.salesStaff(c);
  }

  traineeCount(c: Company): number {
    return c.trainees.reduce((s, t) => s + t.count, 0);
  }

  capacity(c: Company): number {
    return this.opsStaff(c) * CONFIG.staff.tilesPerOps + c.buildings.branch * CONFIG.buildings.branch.capacity;
  }

  coverage(c: Company): number {
    return c.tiles === 0 ? 1 : Math.min(1, this.capacity(c) / c.tiles);
  }

  pushPerDay(c: Company): number {
    const ad = 1 + c.buildings.adAgency * CONFIG.buildings.adAgency.pushBonus;
    return this.salesStaff(c) * CONFIG.sales.pushPerRepPerDay * CONFIG.prices[c.price].push * ad;
  }

  maxPush(c: Company): number {
    return Math.max(10, this.salesStaff(c) * CONFIG.sales.maxPushDaysStored);
  }

  maxDebt(c: Company): number {
    return Math.max(CONFIG.bank.loanChunk, c.pnl.revenue * CONFIG.bank.maxDebtRevenueDays);
  }

  valuation(c: Company): ValuationBreakdown {
    if (!c.alive) return { cash: 0, debt: 0, assets: 0, earnings: 0, total: 0 };
    const v = CONFIG.valuation;
    const assets = c.buildingSpend * v.assetRecovery;
    const earnings = Math.max(0, c.avgProfit) * 365 * v.earningsMultiple;
    return { cash: c.cash, debt: c.debt, assets, earnings, total: c.cash - c.debt + assets + earnings };
  }

  revenueMult(): number {
    let m = 1;
    for (const e of this.events) {
      if (e.kind === 'recession') m *= 0.7;
      if (e.kind === 'boom') m *= 1.25;
    }
    return m;
  }

  variableCostMult(c: Company): number {
    let m = CONFIG.buildings.warehouse.variableCostMult ** c.buildings.warehouse;
    for (const e of this.events) if (e.kind === 'supplierHike') m *= 2;
    return m;
  }

  /** Push needed to win one tile from `target` (NEUTRAL or a company id). */
  tileCost(attacker: Company, target: number, tile: number): number {
    const d = this.map.demand[tile];
    if (target === NEUTRAL) return CONFIG.sales.neutralTileCost * d;
    const def = this.companies[target];
    let mult = Math.max(0.3, this.coverage(def)) * CONFIG.prices[def.price].loyalty;
    const ar = CONFIG.prices[attacker.price].revenue;
    const dr = CONFIG.prices[def.price].revenue;
    if (ar < dr) mult *= 0.75;
    if (ar > dr) mult *= 1.25;
    return CONFIG.sales.rivalTileCost * d * mult;
  }

  // ---------- player / bot actions ----------

  setSalesShare(c: Company, share: number): void {
    c.salesShare = Math.min(1, Math.max(0, share));
  }

  setPrice(c: Company, price: PriceLevel): void {
    if (c.price !== price) {
      c.price = price;
      if (!c.isBot) this.addLog(`You set prices to ${CONFIG.prices[price].label}.`, 'info');
    }
  }

  hire(c: Company, n: number): string | null {
    const cost = n * CONFIG.staff.hireCost;
    if (c.cash < cost) return 'Not enough cash to hire.';
    c.cash -= cost;
    c.trainees.push({ count: n, readyDay: this.day + CONFIG.staff.trainingDays });
    return null;
  }

  fire(c: Company, n: number): string | null {
    n = Math.min(n, c.employees - 1);
    if (n <= 0) return 'You need at least one employee.';
    c.employees -= n;
    c.cash -= n * CONFIG.staff.fireCost;
    return null;
  }

  build(c: Company, type: BuildingType): string | null {
    const b = CONFIG.buildings[type];
    if (c.buildings[type] >= b.max) return `You already have the maximum of ${b.max} ${b.label}s.`;
    if (c.cash < b.cost) return `Not enough cash for a ${b.label}.`;
    c.cash -= b.cost;
    c.buildings[type]++;
    c.buildingSpend += b.cost;
    if (!c.isBot) this.addLog(`You opened a ${b.label}.`, 'good');
    return null;
  }

  borrow(c: Company): string | null {
    const room = this.maxDebt(c) - c.debt;
    const amount = Math.min(CONFIG.bank.loanChunk, room);
    if (amount < 1000) return 'The bank will not lend more: grow revenue first.';
    c.debt += amount;
    c.cash += amount;
    return null;
  }

  repay(c: Company): string | null {
    const amount = Math.min(CONFIG.bank.loanChunk, c.debt, Math.max(0, c.cash));
    if (amount <= 0) return c.debt <= 0 ? 'You have no debt.' : 'Not enough cash to repay.';
    c.debt -= amount;
    c.cash -= amount;
    return null;
  }

  /** Commit part of the push pool to win customers around `tile`. */
  launchCampaign(c: Company, tile: number): string | null {
    if (!c.alive) return 'Your company is bankrupt.';
    const target = this.owner[tile];
    if (target === WATER) return 'Nobody lives there.';
    if (target === c.id) return 'Those are already your customers.';
    if (!this.touches(c, target)) return 'You can only expand into markets next to yours.';
    const budget = c.push * CONFIG.sales.campaignShare;
    if (budget < 1) return 'Not enough sales push yet: put more staff in Sales.';
    c.push -= budget;
    const x = tile % this.map.width;
    const y = (tile / this.map.width) | 0;
    const existing = c.campaigns.find((k) => k.target === target);
    if (existing) {
      existing.budget += budget;
      existing.aimX = x;
      existing.aimY = y;
    } else {
      c.campaigns.push({ target, aimX: x, aimY: y, budget });
    }
    return null;
  }

  /** Does company `c` share a border with `target`? */
  touches(c: Company, target: number): boolean {
    for (const b of c.border) {
      for (const n of neighbors4(this.map, b, this.nb)) if (this.owner[n] === target) return true;
    }
    return false;
  }

  // ---------- simulation ----------

  step(): void {
    if (this.result) return;
    this.tick++;
    const dt = 1 / CONFIG.ticksPerDay;
    const isNewDay = this.tick % CONFIG.ticksPerDay === 0;

    this.updateEvents();

    for (const c of this.companies) {
      if (!c.alive) continue;
      this.graduateTrainees(c);
      c.push = Math.min(this.maxPush(c), c.push + this.pushPerDay(c) * dt);
      this.runCampaigns(c);
      this.applyChurn(c, dt);
      this.applyEconomy(c, dt);
      c.peakTiles = Math.max(c.peakTiles, c.tiles);
      c.peakValuation = Math.max(c.peakValuation, this.valuation(c).total);
    }

    for (const c of this.companies) {
      if (!c.alive) continue;
      this.checkBankruptcy(c, dt);
      if (isNewDay && c.isBot && c.alive) botDecide(this, c);
    }

    this.checkWin();
  }

  private graduateTrainees(c: Company): void {
    if (c.trainees.length === 0) return;
    const day = this.day;
    c.trainees = c.trainees.filter((t) => {
      if (t.readyDay <= day) {
        c.employees += t.count;
        return false;
      }
      return true;
    });
  }

  private runCampaigns(c: Company): void {
    if (c.campaigns.length === 0) return;
    const keep: Campaign[] = [];
    for (const k of c.campaigns) {
      if (k.target >= 0 && !this.companies[k.target].alive) k.target = NEUTRAL;
      const done = this.advanceCampaign(c, k);
      if (done) c.push = Math.min(this.maxPush(c), c.push + k.budget);
      else keep.push(k);
    }
    c.campaigns = keep;
  }

  /** Returns true when the campaign is finished. */
  private advanceCampaign(c: Company, k: Campaign): boolean {
    const id = this.stampId++;
    const candidates: { tile: number; score: number }[] = [];
    const w = this.map.width;
    for (const b of c.border) {
      for (const n of neighbors4(this.map, b, this.nb)) {
        if (this.owner[n] !== k.target || this.stamp[n] === id) continue;
        this.stamp[n] = id;
        const dx = (n % w) - k.aimX;
        const dy = ((n / w) | 0) - k.aimY;
        candidates.push({ tile: n, score: Math.sqrt(dx * dx + dy * dy) + this.rng.next() * 4 });
      }
    }
    if (candidates.length === 0) return true;
    candidates.sort((a, b) => a.score - b.score);
    const perTick = Math.max(2, Math.ceil(candidates.length / 12));
    let taken = 0;
    for (const cand of candidates) {
      if (taken >= perTick) break;
      const cost = this.tileCost(c, k.target, cand.tile);
      if (k.budget < cost) return true;
      k.budget -= cost;
      this.setOwner(cand.tile, c.id);
      taken++;
    }
    return false;
  }

  private applyChurn(c: Company, dt: number): void {
    const excess = c.tiles - this.capacity(c);
    if (excess <= 0) {
      c.churnCarry = 0;
      return;
    }
    c.churnCarry += Math.max(0.5, excess * CONFIG.churn.ratePerDay) * dt;
    if (c.churnCarry < 1) return;
    const lose = Math.floor(c.churnCarry);
    c.churnCarry -= lose;
    const border = [...c.border];
    for (let i = 0; i < lose && border.length > 0; i++) {
      const j = this.rng.int(0, border.length);
      const tile = border[j];
      border[j] = border[border.length - 1];
      border.pop();
      if (this.owner[tile] === c.id) this.setOwner(tile, NEUTRAL);
    }
  }

  private applyEconomy(c: Company, dt: number): void {
    const served = c.customers * this.coverage(c);
    const p: Pnl = {
      revenue: served * CONFIG.prices[c.price].revenue * this.revenueMult(),
      variableCost: served * CONFIG.variableCostPerCustomer * this.variableCostMult(c),
      salaries: (c.employees + this.traineeCount(c)) * CONFIG.staff.salaryPerDay,
      rent:
        c.buildings.branch * CONFIG.buildings.branch.rentPerDay +
        c.buildings.warehouse * CONFIG.buildings.warehouse.rentPerDay +
        c.buildings.adAgency * CONFIG.buildings.adAgency.rentPerDay,
      interest: (c.debt * CONFIG.bank.interestPerYear) / 365,
      profit: 0,
    };
    p.profit = p.revenue - p.variableCost - p.salaries - p.rent - p.interest;
    c.pnl = p;
    c.cash += p.profit * dt;
    const alpha = dt / CONFIG.valuation.profitWindowDays;
    c.avgProfit += (p.profit - c.avgProfit) * alpha;
  }

  private checkBankruptcy(c: Company, dt: number): void {
    if (c.tiles === 0) {
      this.bankrupt(c, 'lost every customer');
      return;
    }
    if (c.cash >= 0) {
      c.negativeCashDays = 0;
      return;
    }
    if (c.negativeCashDays === 0) {
      this.addLog(
        c.isBot ? `${c.name} is out of cash!` : `You are out of cash! Fix it within ${CONFIG.bankruptcyGraceDays} days.`,
        'bad',
      );
    }
    c.negativeCashDays += dt;
    if (c.negativeCashDays >= CONFIG.bankruptcyGraceDays) this.bankrupt(c, 'ran out of cash');
  }

  private bankrupt(c: Company, why: string): void {
    c.alive = false;
    c.bankruptDay = this.day;
    c.campaigns = [];
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === c.id) this.setOwner(i, NEUTRAL);
    this.addLog(
      c.isBot ? `${c.name} ${why} and closed. Its customers are up for grabs.` : `Your company ${why} and closed.`,
      c.isBot ? 'good' : 'bad',
    );
  }

  private updateEvents(): void {
    const day = this.day;
    this.events = this.events.filter((e) => {
      if (e.endsDay > day) return true;
      this.addLog(`${EVENT_INFO[e.kind].title} is over.`, 'info');
      return false;
    });
    if (day >= this.nextEventDay) {
      const kind = this.rng.pick<GameEventKind>(['recession', 'supplierHike', 'boom']);
      const info = EVENT_INFO[kind];
      this.events.push({ kind, endsDay: day + info.days });
      this.addLog(`${info.title}! ${info.text}`, kind === 'boom' ? 'good' : 'bad');
      this.nextEventDay = day + this.rng.range(CONFIG.events.minGap, CONFIG.events.maxGap);
    }
  }

  private checkWin(): void {
    const day = this.day;
    for (const c of this.companies) {
      if (c.alive && this.valuation(c).total >= CONFIG.valuation.unicorn) {
        this.finish(c.id, 'unicorn');
        return;
      }
    }
    if (!this.player.alive) {
      this.finish(this.leaderId(), 'playerBankrupt');
      return;
    }
    const alive = this.companies.filter((c) => c.alive);
    if (alive.length === 1 && this.companies.length > 1) {
      this.finish(alive[0].id, 'lastStanding');
      return;
    }
    if (day >= CONFIG.matchDays) this.finish(this.leaderId(), 'time');
  }

  private finish(winnerId: number | null, reason: GameResult['reason']): void {
    this.result = { winnerId, reason, day: this.day };
    const w = winnerId === null ? null : this.companies[winnerId];
    if (reason === 'unicorn' && w) this.addLog(`🦄 ${w.isBot ? w.name : 'You'} became a unicorn!`, 'good');
  }

  leaderId(): number | null {
    let best: Company | null = null;
    for (const c of this.companies) {
      if (!c.alive) continue;
      if (!best || this.valuation(c).total > this.valuation(best).total) best = c;
    }
    return best ? best.id : null;
  }

  // ---------- map bookkeeping ----------

  setOwner(tile: number, newOwner: number): void {
    const old = this.owner[tile];
    if (old === newOwner || old === WATER) return;
    const d = this.map.demand[tile];
    if (old >= 0) {
      const oc = this.companies[old];
      oc.tiles--;
      oc.customers -= d;
      oc.border.delete(tile);
    }
    this.owner[tile] = newOwner;
    if (newOwner >= 0) {
      const nc = this.companies[newOwner];
      nc.tiles++;
      nc.customers += d;
    }
    this.refreshBorder(tile);
    for (const n of neighbors4(this.map, tile, this.nb2)) this.refreshBorder(n);
    this.ownershipVersion++;
  }

  /** A tile is on its owner's border if any neighbour is neutral or a rival. */
  isBorder(tile: number): boolean {
    const o = this.owner[tile];
    if (o < 0) return false;
    for (const n of neighbors4(this.map, tile, this.nb)) {
      const no = this.owner[n];
      if (no !== o && no !== WATER) return true;
    }
    return false;
  }

  private refreshBorder(tile: number): void {
    const o = this.owner[tile];
    if (o < 0) return;
    const set = this.companies[o].border;
    if (this.isBorder(tile)) set.add(tile);
    else set.delete(tile);
  }

  private placeSpawns(): void {
    const { width: w, height: h } = this.map;
    const spots: [number, number][] = [];
    let minDist = 45;
    let attempts = 0;
    while (spots.length < this.companies.length) {
      attempts++;
      if (attempts % 400 === 0) minDist *= 0.85;
      const x = this.rng.int(8, w - 8);
      const y = this.rng.int(6, h - 6);
      const i = y * w + x;
      if (this.map.isWater[i] || this.map.demand[i] > 2) continue;
      if (spots.some(([sx, sy]) => (sx - x) ** 2 + (sy - y) ** 2 < minDist * minDist)) continue;
      spots.push([x, y]);
    }
    const r = CONFIG.start.radius;
    spots.forEach(([sx, sy], id) => {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const i = (sy + dy) * w + (sx + dx);
          if (this.owner[i] === NEUTRAL) this.setOwner(i, id);
        }
      }
    });
  }

  addLog(text: string, tone: LogEntry['tone']): void {
    this.log.push({ day: Math.floor(this.day), text, tone });
    if (this.log.length > 50) this.log.shift();
  }
}
