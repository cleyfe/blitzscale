import './style.css';
import { CONFIG } from './game/config';
import { Game } from './game/game';
import { defaultCompanies } from './game/setup';
import type { GameResult } from './game/types';
import { money } from './ui/format';
import { Board, describeTile, Hud, TopBar } from './ui/hud';
import { MapRenderer } from './ui/renderer';

const app = document.getElementById('app')!;

function showIntro(): void {
  app.innerHTML = `
    <div class="overlay"><div class="card intro">
      <h1>Market<b>Front</b></h1>
      <p class="lead">Run a company. Win customers. Don't run out of cash.</p>
      <ol>
        <li>🗺️ The map is a market. Grey areas are untapped customers; colours are companies.</li>
        <li>🤝 Staff in <b>Sales</b> build up <b>push</b>. Click next to your territory to win customers.</li>
        <li>⚙️ Staff in <b>Operations</b> serve customers. Each serves ${CONFIG.staff.tilesPerOps} areas. Overloaded companies lose customers.</li>
        <li>🏷️ <b>Price</b> trades margin for growth and loyalty.</li>
        <li>📊 Every day: <b>Revenue − Costs = Profit</b>, added to cash. Cash below zero for ${CONFIG.bankruptcyGraceDays} days means bankruptcy.</li>
        <li>🦄 First company valued at <b>$1B</b> wins. Otherwise the most valuable company after ${CONFIG.matchDays} days wins.</li>
      </ol>
      <div class="intro-actions">
        <input id="name" maxlength="16" placeholder="Your company name" value="Your Co" />
        <button id="start" class="primary">Start company</button>
      </div>
      <p class="tip">Rivals: <b style="color:#e74c3c">BudgetMart</b> (cheap &amp; aggressive), <b style="color:#2ecc71">Steady &amp; Co</b> (balanced), <b style="color:#9b59b6">Luxe Ltd</b> (premium).</p>
    </div></div>`;
  const start = () => {
    const name = (document.getElementById('name') as HTMLInputElement).value.trim() || 'Your Co';
    startGame(name, Math.floor(Math.random() * 1e9));
  };
  document.getElementById('start')!.addEventListener('click', start);
  document.getElementById('name')!.addEventListener('keydown', (e) => e.key === 'Enter' && start());
}

function startGame(name: string, seed: number): void {
  const game = new Game(seed, defaultCompanies(name));
  let speed = 1;

  app.innerHTML = '';
  const top = new TopBar(game, (s) => (speed = s));
  const renderer = new MapRenderer(game);
  const hud = new Hud(game);
  const board = new Board(game);

  const main = document.createElement('main');
  const mapWrap = document.createElement('div');
  mapWrap.className = 'map-wrap';
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  mapWrap.append(renderer.canvas, tooltip);
  const left = document.createElement('div');
  left.className = 'left';
  left.append(mapWrap, board.root);
  main.append(left, hud.root);
  app.append(top.root, main);

  renderer.canvas.addEventListener('click', (ev) => {
    const tile = renderer.tileAt(ev);
    if (tile >= 0) hud.report(game.launchCampaign(game.player, tile));
  });
  renderer.canvas.addEventListener('mousemove', (ev) => {
    const tile = renderer.tileAt(ev);
    if (tile < 0) return;
    tooltip.textContent = describeTile(game, tile);
    const rect = mapWrap.getBoundingClientRect();
    tooltip.style.left = `${ev.clientX - rect.left + 14}px`;
    tooltip.style.top = `${ev.clientY - rect.top + 14}px`;
    tooltip.style.display = 'block';
  });
  renderer.canvas.addEventListener('mouseleave', () => (tooltip.style.display = 'none'));

  let last = performance.now();
  let acc = 0;
  let uiTimer = 0;
  const msPerTick = 1000 / CONFIG.ticksPerDay;
  const frame = (now: number) => {
    const elapsed = Math.min(250, now - last);
    last = now;
    acc += elapsed * speed;
    while (acc >= msPerTick && !game.result) {
      game.step();
      acc -= msPerTick;
    }
    renderer.draw();
    uiTimer += elapsed;
    if (uiTimer > 120 || game.result) {
      uiTimer = 0;
      top.update();
      hud.update();
      board.update();
    }
    if (game.result) showResult(game, game.result);
    else requestAnimationFrame(frame);
  };
  renderer.draw(true);
  requestAnimationFrame(frame);
}

function showResult(game: Game, r: GameResult): void {
  const me = game.player;
  const won = r.winnerId === 0;
  const winner = r.winnerId === null ? null : game.companies[r.winnerId];
  const headline = won
    ? r.reason === 'unicorn'
      ? '🦄 You built a unicorn!'
      : '🏆 You won!'
    : r.reason === 'playerBankrupt'
      ? '💸 Your company closed'
      : `${winner?.name ?? 'Nobody'} wins`;
  const why: Record<GameResult['reason'], string> = {
    unicorn: `${winner?.isBot ? winner.name : 'You'} reached a $1B valuation on day ${Math.floor(r.day)}.`,
    time: `After ${CONFIG.matchDays} days, ${winner?.isBot ? winner.name : 'you'} had the most valuable company.`,
    lastStanding: `${winner?.isBot ? winner.name : 'You'} outlasted every rival.`,
    playerBankrupt: `On day ${Math.floor(r.day)} you ${me.tiles === 0 ? 'lost every customer' : 'ran out of cash'}.`,
  };
  const lessons: string[] = [];
  if (me.debt > 0 && !me.alive) lessons.push('Debt made you fragile: interest kept running when revenue fell.');
  if (me.peakTiles > 0 && me.peakTiles > me.tiles * 2 && me.alive)
    lessons.push('You grew big but lost much of it. Growth needs capacity to serve customers.');
  if (me.price === 'low') lessons.push('Low prices win market share, but thin margins make valuation hard to grow.');
  if (me.buildings.warehouse === 0) lessons.push('A Warehouse cuts variable costs: scale makes each customer cheaper to serve.');
  lessons.push('Valuation = cash − debt + assets + 10× yearly profit. Profit drives value more than size does.');

  const rows = [...game.companies]
    .sort((a, b) => b.peakValuation - a.peakValuation)
    .map(
      (c) => `<tr><td><i style="background:rgb(${c.color.join(',')})"></i>${c.name}</td>
        <td>${c.alive ? money(game.valuation(c).total) : 'closed'}</td><td>${money(c.peakValuation)}</td><td>${c.peakTiles}</td></tr>`,
    )
    .join('');

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="card result">
    <h1>${headline}</h1>
    <p class="lead">${why[r.reason]}</p>
    <table class="final"><tr><th>Company</th><th>Final value</th><th>Peak value</th><th>Peak areas</th></tr>${rows}</table>
    <h3>What to take away</h3>
    <ul>${lessons.map((l) => `<li>${l}</li>`).join('')}</ul>
    <button class="primary" id="again">Play again</button>
  </div>`;
  document.body.append(overlay);
  document.getElementById('again')!.addEventListener('click', () => {
    overlay.remove();
    showIntro();
  });
}

showIntro();
