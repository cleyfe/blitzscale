import type { BuildingType, PriceLevel } from './config';

export type Personality = 'discounter' | 'balanced' | 'premium';

export interface Pnl {
  revenue: number;
  variableCost: number;
  salaries: number;
  rent: number;
  interest: number;
  profit: number;
}

export interface Campaign {
  /** Owner id being targeted, or NEUTRAL for the untapped market. */
  target: number;
  aimX: number;
  aimY: number;
  budget: number;
}

export interface Company {
  id: number;
  name: string;
  color: [number, number, number];
  isBot: boolean;
  personality: Personality;
  alive: boolean;

  cash: number;
  debt: number;
  employees: number; // productive staff
  trainees: { count: number; readyDay: number }[];
  salesShare: number; // 0..1 of productive staff in sales
  price: PriceLevel;
  buildings: Record<BuildingType, number>;
  buildingSpend: number;

  push: number;
  campaigns: Campaign[];

  tiles: number;
  customers: number; // total demand of owned tiles
  border: Set<number>;

  pnl: Pnl; // per day, latest
  avgProfit: number; // trailing average per day
  churnCarry: number;
  negativeCashDays: number;

  peakTiles: number;
  peakValuation: number;
  bankruptDay: number | null;
}

export type GameEventKind = 'recession' | 'supplierHike' | 'boom';

export interface ActiveEvent {
  kind: GameEventKind;
  endsDay: number;
}

export interface LogEntry {
  day: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
}

export type WinReason = 'unicorn' | 'time' | 'lastStanding' | 'playerBankrupt';

export interface GameResult {
  winnerId: number | null;
  reason: WinReason;
  day: number;
}

export interface ValuationBreakdown {
  cash: number;
  debt: number;
  assets: number;
  earnings: number;
  total: number;
}
