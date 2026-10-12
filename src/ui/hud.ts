import { BUILDING_TYPES, CONFIG, PRICE_LEVELS, type BuildingType } from '../game/config';
import { EVENT_INFO, type Game } from '../game/game';
import { NEUTRAL, WATER } from '../game/map';
import { int, money, pct } from './format';

const BUILDING_INFO: Record<BuildingType, { icon: string; effect: string }> = {
  branch: { icon: '🏬', effect: `+${CONFIG.buildings.branch.capacity} customers served` },
  warehouse: {
    icon: '🏭',
    effect: `Variable costs −${pct(1 - CONFIG.buildings.warehouse.variableCostMult)}`,
  },
  adAgency: { icon: '📣', effect: `Sales push +${pct(CONFIG.buildings.adAgency.pushBonus)}` },
};

const el = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

/** The side panel: every lever the player can pull, plus a live P&L. */
export class Hud {
  readonly root: HTMLElement;
  private toastTimer = 0;

  constructor(private game: Game) {
    this.root = document.createElement('aside');
    this.root.className = 'hud';
    this.root.innerHTML = this.template();
    this.bind();
  }

  private get me() {
    return this.game.player;
  }

  private template(): string {
    const prices = PRICE_LEVELS.map((p) => `<button data-price="${p}">${CONFIG.prices[p].label}</button>`).join('');
    const buildings = BUILDING_TYPES.map((t) => {
      const b = CONFIG.buildings[t];
      const info = BUILDING_INFO[t];
      return `<button class="building" data-build="${t}">
        <span class="b-icon">${info.icon}</span>
        <span class="b-main"><b>${b.label}</b> <span data-bcount="${t}"></span><br>
        <small>${info.effect}</small></span>
        <span class="b-cost">${money(b.cost)}<br><small>${money(b.rentPerDay)}/day rent</small></span>
      </button>`;
    }).join('');

    return `
      <section class="panel valuation">
        <div class="label">Company valuation</div>
        <div class="big" data-v="total"></div>
        <div class="unicorn"><div class="unicorn-fill" data-v="unicornFill"></div><span data-v="unicornText"></span></div>
        <div class="formula">
          <span>Cash <b data-v="vCash"></b></span>
          <span>− Debt <b data-v="vDebt"></b></span>
          <span>+ Assets <b data-v="vAssets"></b></span>
          <span>+ 10× yearly profit <b data-v="vEarnings"></b></span>
        </div>
        <p class="tip">💡 Investors pay for <b>profit</b>, not size. Reach $1B to become a unicorn 🦄.</p>
      </section>

      <section class="panel">
        <h3>Profit &amp; Loss <small>per day</small></h3>
        <table class="pnl">
          <tr><td>Revenue</td><td data-v="revenue" class="pos"></td></tr>
          <tr><td>− Variable costs</td><td data-v="variableCost" class="neg"></td></tr>
          <tr><td>− Salaries</td><td data-v="salaries" class="neg"></td></tr>
          <tr><td>− Rent</td><td data-v="rent" class="neg"></td></tr>
          <tr><td>− Interest</td><td data-v="interest" class="neg"></td></tr>
          <tr class="total"><td>= Profit</td><td data-v="profit"></td></tr>
          <tr class="cash"><td>Cash</td><td data-v="cash"></td></tr>
        </table>
        <div class="warn" data-v="cashWarn" hidden></div>
      </section>

      <section class="panel">
        <h3>Team <small data-v="team"></small></h3>
        <div class="split-labels"><span>⚙️ Operations <b data-v="ops"></b></span><span>Sales <b data-v="sales"></b> 🤝</span></div>
        <input type="range" min="0" max="100" step="5" data-input="split" />
        <div class="meter"><div data-v="coverFill"></div></div>
        <div class="row small"><span>Customers served</span><span data-v="coverage"></span></div>
        <div class="warn" data-v="overload" hidden>Overloaded! Unserved customers are leaving. Move staff to Operations, hire, or open a Branch.</div>
        <div class="buttons">
          <button data-hire="1">Hire +1</button><button data-hire="10">Hire +10</button>
          <button data-fire="1" class="ghost">Fire −1</button><button data-fire="10" class="ghost">Fire −10</button>
        </div>
        <p class="tip">💡 Hiring costs ${money(CONFIG.staff.hireCost)} up front plus ${money(CONFIG.staff.salaryPerDay)}/day. New hires train for ${CONFIG.staff.trainingDays} days before they help: an investment.</p>
      </section>

      <section class="panel">
        <h3>Price</h3>
        <div class="seg" data-v="prices">${prices}</div>
        <div class="row small"><span>Margin per customer</span><span data-v="margin"></span></div>
        <p class="tip" data-v="priceTip"></p>
      </section>

      <section class="panel">
        <h3>Sales push <small data-v="pushRate"></small></h3>
        <div class="meter push"><div data-v="pushFill"></div></div>
        <p class="tip">👆 Click the map next to your territory to launch a campaign. It spends half your push. Rivals' customers cost more to win, especially if they're cheap or well served.</p>
      </section>

      <section class="panel">
        <h3>Buildings</h3>
        ${buildings}
      </section>

      <section class="panel">
        <h3>Bank</h3>
        <div class="row"><span>Debt</span><b data-v="debt"></b></div>
        <div class="row small"><span>Credit limit (${CONFIG.bank.maxDebtRevenueDays} days of revenue)</span><span data-v="limit"></span></div>
        <div class="row small"><span>Interest ${pct(CONFIG.bank.interestPerYear)}/year</span><span data-v="interestDay"></span></div>
        <div class="buttons">
          <button data-bank="borrow">Borrow ${money(CONFIG.bank.loanChunk)}</button>
          <button data-bank="repay" class="ghost">Repay ${money(CONFIG.bank.loanChunk)}</button>
        </div>
        <p class="tip">💡 Debt speeds up growth, but interest is due even in a recession.</p>
      </section>`;
  }

  private bind(): void {
    const g = this.game;
    const r = this.root;
    el<HTMLInputElement>(r, '[data-input="split"]').addEventListener('input', (e) => {
      g.setSalesShare(this.me, Number((e.target as HTMLInputElement).value) / 100);
    });
    r.querySelectorAll<HTMLButtonElement>('[data-price]').forEach((b) =>
      b.addEventListener('click', () => g.setPrice(this.me, b.dataset.price as never)),
    );
    r.querySelectorAll<HTMLButtonElement>('[data-hire]').forEach((b) =>
      b.addEventListener('click', () => this.report(g.hire(this.me, Number(b.dataset.hire)))),
    );
    r.querySelectorAll<HTMLButtonElement>('[data-fire]').forEach((b) =>
      b.addEventListener('click', () => this.report(g.fire(this.me, Number(b.dataset.fire)))),
    );
    r.querySelectorAll<HTMLButtonElement>('[data-build]').forEach((b) =>
      b.addEventListener('click', () => this.report(g.build(this.me, b.dataset.build as BuildingType))),
    );
    el(r, '[data-bank="borrow"]').addEventListener('click', () => this.report(g.borrow(this.me)));
    el(r, '[data-bank="repay"]').addEventListener('click', () => this.report(g.repay(this.me)));
  }

  report(error: string | null): void {
    if (error) this.toast(error);
  }

  toast(text: string): void {
    const t = document.querySelector<HTMLElement>('.toast');
    if (!t) return;
    t.textContent = text;
    t.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), 2200);
  }

  private set(key: string, text: string, cls?: string): HTMLElement {
    const e = el(this.root, `[data-v="${key}"]`);
    e.textContent = text;
    if (cls !== undefined) e.className = cls;
    return e;
  }

  update(): void {
    const g = this.game;
    const c = this.me;
    const v = g.valuation(c);

    // Valuation, on a log scale from $1M to $1B so early progress is visible.
    this.set('total', money(v.total));
    const progress = Math.max(0, Math.min(1, Math.log10(Math.max(1, v.total) / 1e6) / 3));
    el(this.root, '[data-v="unicornFill"]').style.width = pct(progress);
    this.set('unicornText', `🦄 ${money(Math.max(0, v.total))} / $1B unicorn`);
    this.set('vCash', money(v.cash));
    this.set('vDebt', money(v.debt));
    this.set('vAssets', money(v.assets));
    this.set('vEarnings', money(v.earnings));

    const p = c.pnl;
    this.set('revenue', money(p.revenue));
    this.set('variableCost', money(p.variableCost));
    this.set('salaries', money(p.salaries));
    this.set('rent', money(p.rent));
    this.set('interest', money(p.interest));
    this.set('profit', money(p.profit), p.profit >= 0 ? 'pos' : 'neg');
    this.set('cash', money(c.cash), c.cash >= 0 ? '' : 'neg');
    const warn = el(this.root, '[data-v="cashWarn"]');
    if (c.cash < 0) {
      warn.hidden = false;
      warn.textContent = `Out of cash! Bankrupt in ${Math.max(0, CONFIG.bankruptcyGraceDays - c.negativeCashDays).toFixed(0)} days. Borrow, cut staff, or raise prices.`;
    } else if (p.profit < 0 && c.cash / -p.profit < 30) {
      warn.hidden = false;
      warn.textContent = `Losing money: cash runs out in ~${Math.floor(c.cash / -p.profit)} days.`;
    } else {
      warn.hidden = true;
    }

    const trainees = g.traineeCount(c);
    this.set('team', `${int(c.employees)} staff${trainees ? ` + ${trainees} training` : ''}`);
    this.set('ops', int(g.opsStaff(c)));
    this.set('sales', int(g.salesStaff(c)));
    const slider = el<HTMLInputElement>(this.root, '[data-input="split"]');
    if (document.activeElement !== slider) slider.value = String(Math.round(c.salesShare * 100));
    const cap = g.capacity(c);
    const cover = g.coverage(c);
    el(this.root, '[data-v="coverFill"]').style.width = pct(cover);
    el(this.root, '[data-v="coverFill"]').className = cover < 1 ? 'bad' : '';
    this.set('coverage', `${int(Math.min(cap, c.tiles))} / ${int(c.tiles)} areas (capacity ${int(cap)})`);
    el(this.root, '[data-v="overload"]').hidden = cover >= 1;

    this.root.querySelectorAll<HTMLButtonElement>('[data-price]').forEach((b) =>
      b.classList.toggle('active', b.dataset.price === c.price),
    );
    const margin = CONFIG.prices[c.price].revenue * g.revenueMult() - CONFIG.variableCostPerCustomer * g.variableCostMult(c);
    this.set('margin', `${money(margin)} / day`);
    this.set(
      'priceTip',
      c.price === 'low'
        ? '💡 Low prices: thin margins, but you win customers fast and they stay loyal.'
        : c.price === 'high'
          ? '💡 High prices: fat margins, but growth is slow and rivals can steal customers easily.'
          : '💡 Medium prices: a balance between margin and growth.',
    );

    this.set('pushRate', `+${g.pushPerDay(c).toFixed(1)}/day`);
    el(this.root, '[data-v="pushFill"]').style.width = pct(c.push / g.maxPush(c));

    for (const t of BUILDING_TYPES) {
      const n = c.buildings[t];
      el(this.root, `[data-bcount="${t}"]`).textContent = n ? `×${n}` : '';
      const btn = el<HTMLButtonElement>(this.root, `[data-build="${t}"]`);
      btn.disabled = n >= CONFIG.buildings[t].max || c.cash < CONFIG.buildings[t].cost;
    }

    this.set('debt', money(c.debt));
    this.set('limit', money(g.maxDebt(c)));
    this.set('interestDay', `${money(p.interest)}/day`);
  }
}

/** Top bar: time, speed and active market events. */
export class TopBar {
  readonly root: HTMLElement;
  constructor(
    private game: Game,
    onSpeed: (speed: number) => void,
  ) {
    this.root = document.createElement('header');
    this.root.className = 'topbar';
    this.root.innerHTML = `
      <div class="brand">Market<b>Front</b></div>
      <div class="clock"><span data-v="day"></span><div class="timebar"><div data-v="timeFill"></div></div></div>
      <div class="events" data-v="events"></div>
      <div class="speed">
        <button data-speed="0">⏸</button><button data-speed="1" class="active">1×</button><button data-speed="2">2×</button><button data-speed="4">4×</button>
      </div>`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) =>
      b.addEventListener('click', () => {
        onSpeed(Number(b.dataset.speed));
        this.root.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('active', x === b));
      }),
    );
  }

  update(): void {
    const g = this.game;
    const day = Math.floor(g.day);
    el(this.root, '[data-v="day"]').textContent = `Day ${day} · Year ${Math.floor(day / 365) + 1}`;
    el(this.root, '[data-v="timeFill"]').style.width = pct(g.day / CONFIG.matchDays);
    el(this.root, '[data-v="events"]').innerHTML = g.events
      .map((e) => {
        const info = EVENT_INFO[e.kind];
        return `<span class="event ${e.kind}" title="${info.text}">${info.title} · ${Math.ceil(e.endsDay - g.day)}d</span>`;
      })
      .join('');
  }
}

/** Leaderboard and news feed shown under the map. */
export class Board {
  readonly root: HTMLElement;
  constructor(private game: Game) {
    this.root = document.createElement('div');
    this.root.className = 'board';
    this.root.innerHTML = `<section class="panel leaders"><h3>Leaderboard</h3><table data-v="leaders"></table></section>
      <section class="panel news"><h3>News</h3><ul data-v="news"></ul></section>`;
  }

  update(): void {
    const g = this.game;
    const land = g.owner.reduce((s, o) => s + (o === WATER ? 0 : 1), 0);
    const rows = [...g.companies]
      .sort((a, b) => g.valuation(b).total - g.valuation(a).total || b.tiles - a.tiles)
      .map((c) => {
        const col = `rgb(${c.color.join(',')})`;
        const status = c.alive ? `${pct(c.tiles / land)} share` : 'closed';
        return `<tr class="${c.alive ? '' : 'dead'} ${c.isBot ? '' : 'me'}">
          <td><i style="background:${col}"></i>${c.name}</td>
          <td>${CONFIG.prices[c.price].label}</td><td>${status}</td><td>${money(g.valuation(c).total)}</td></tr>`;
      })
      .join('');
    el(this.root, '[data-v="leaders"]').innerHTML =
      `<tr><th>Company</th><th>Price</th><th>Market</th><th>Value</th></tr>${rows}`;
    el(this.root, '[data-v="news"]').innerHTML = g.log
      .slice(-7)
      .reverse()
      .map((l) => `<li class="${l.tone}"><span>D${l.day}</span>${l.text}</li>`)
      .join('');
  }
}

/** Text for the map hover tooltip. */
export function describeTile(g: Game, tile: number): string {
  const o = g.owner[tile];
  if (o === WATER) return 'Water: no customers';
  const d = g.map.demand[tile];
  const who = o === NEUTRAL ? 'Untapped market' : o === 0 ? 'Your customers' : g.companies[o].name;
  let s = `${who} · ${d.toFixed(2)} customers`;
  if (o !== 0) s += ` · costs ${g.tileCost(g.player, o, tile).toFixed(1)} push`;
  return s;
}
