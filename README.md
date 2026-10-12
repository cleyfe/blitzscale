# MarketFront 🦄

A real-time business strategy game that teaches how a company makes (and loses) money.
Inspired by territory games like OpenFront, but the map is a **market**, territory is
**customers**, and you win on **valuation**, not land.

```bash
npm install
npm run dev       # play at http://localhost:5173
npm test          # rules tests
npm run balance   # simulate bot-only matches to check game balance
```

## How to win

- 🦄 **Become the first unicorn**: the first company valued at **$1B** wins instantly.
- 🏆 Otherwise, the **most valuable company after 900 days** (~2.5 years, 15 minutes at 1×) wins.
- 💸 If your cash stays below zero for 10 days, or you lose every customer, your company closes.

**Valuation = Cash − Debt + Assets (50% of building cost) + 10 × yearly profit**

Investors pay for profit, so a smaller, profitable company can beat a big one that's losing money.

## Rules

1 game day = 1 second at 1× speed.

| Lever | What it does | What it teaches |
|---|---|---|
| **Ops / Sales split** | Ops staff serve 10 areas each. Sales staff generate *push* to win new customers. | Resource allocation, opportunity cost |
| **Hire / Fire** | $500 to hire, $100/day salary, 8 days of training before new hires are productive. $300 severance. | Hiring is an investment that pays back over time |
| **Price** (Low / Medium / High) | $25 / $40 / $55 per customer per day. Lower prices grow faster and keep customers loyal. | Price elasticity, margin vs volume |
| **Campaigns** | Click the map next to your territory to spend half your push. | Customer acquisition cost |
| **Branch** 🏬 | $20K, $150/day rent, +30 serve capacity | Fixed costs and capacity |
| **Warehouse** 🏭 | $40K, $400/day rent, variable costs −30% (max 3) | Economies of scale |
| **Ad Agency** 📣 | $30K, $300/day rent, sales push +50% (max 3) | Marketing ROI |
| **Bank loan** | $25K at a time, 24%/year interest, credit limit = 60 days of revenue | Leverage and risk |

### Every day

```
Revenue  = customers served × price
Costs    = variable cost ($15 / customer) + salaries + rent + interest
Profit   = Revenue − Costs  → added to Cash
```

- If you have more customers than your Ops staff can serve, the unserved ones bring in no revenue **and start leaving**.
- Winning a rival's customers costs more when they charge less than you, or when they serve their customers well.

### Market events (every ~4–6 months)

- **Recession**: revenue −30% for 60 days
- **Supplier price hike**: variable costs ×2 for 45 days
- **Consumer boom**: revenue +25% for 60 days

### Rivals

- **BudgetMart**: low prices, aggressive, borrows
- **Steady & Co**: balanced
- **Luxe Ltd**: premium prices, cautious, never borrows

## Code layout

```
src/game/   deterministic simulation (no DOM): config, map, game rules, bots
src/ui/     canvas map renderer and HUD panels
tests/      rules tests (vitest)
scripts/    headless balance simulation
```

All tunable numbers live in `src/game/config.ts`. The simulation is seeded and
deterministic, so lockstep multiplayer can be added later.

## Roadmap ideas

- Multiplayer and partnerships (non-compete deals)
- Customer segments (price-sensitive vs quality-sensitive areas)
- R&D and product quality
- Placing buildings on the map
- Stock market / fundraising rounds
