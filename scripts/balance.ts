// Headless balance check: runs bot-only matches and prints how they end.
// Usage: npm run balance -- [matches]
import { CONFIG } from '../src/game/config';
import { Game } from '../src/game/game';
import { defaultCompanies } from '../src/game/setup';

const matches = Number(process.argv[2] ?? 8);
const fmt = (n: number) => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : (n / 1e3).toFixed(0) + 'K');

for (let m = 0; m < matches; m++) {
  const g = new Game(1000 + m, defaultCompanies('Bot-Player', true));
  const checkpoints = [100, 300, 600];
  while (!g.result) {
    g.step();
    if (g.tick % CONFIG.ticksPerDay === 0 && checkpoints.includes(g.day)) {
      console.log(
        `  day ${g.day}: ` +
          g.companies
            .map((c) => `${c.name}[${c.alive ? c.tiles + 't ' + c.employees + 'e $' + fmt(c.cash) + ' v' + fmt(g.valuation(c).total) : 'dead'}]`)
            .join(' '),
      );
    }
  }
  const r = g.result;
  const w = r.winnerId === null ? 'none' : g.companies[r.winnerId].name;
  console.log(`match ${m}: ${w} wins by ${r.reason} on day ${r.day.toFixed(0)}`);
  for (const c of g.companies) {
    const v = g.valuation(c);
    console.log(
      `    ${c.name.padEnd(12)} ${c.alive ? 'alive' : 'BANKRUPT d' + c.bankruptDay?.toFixed(0)} tiles=${c.tiles} peak=${c.peakTiles} emp=${c.employees} cash=${fmt(c.cash)} debt=${fmt(c.debt)} profit/d=${fmt(c.avgProfit)} val=${fmt(v.total)} peakVal=${fmt(c.peakValuation)} bld=${JSON.stringify(c.buildings)}`,
    );
  }
}
