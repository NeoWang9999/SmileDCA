# SmileDCA

SmileDCA is a lightweight, browser-side portfolio DCA backtest simulator for ETF investors.

> “业余投资者定期定投指数基金，往往能战胜绝大多数专业投资者”——沃伦·巴菲特

## What It Does

SmileDCA lets you build a multi-ETF dollar-cost averaging plan, run a historical backtest, and inspect the result in one interactive dashboard.

Core capabilities:

- Search and select ETF tickers from a broad US ETF universe.
- Configure each ETF independently:
  - start date
  - end date
  - DCA frequency: daily, weekly, or monthly
  - amount per contribution
  - enabled / disabled state
- Run a portfolio-level backtest after the plan is configured.
- View the combined portfolio value curve.
- Inspect one selected ETF's K-line / NAV chart at a time.
- Show DCA buy markers on the selected ETF chart, including buy amount.
- Pan, zoom, reset, and expand the chart.
- Highlight the maximum drawdown range.
- Read a narrative summary of the result, including total contribution, final value, drawdown experience, and SPY comparison.
- Switch between English and Chinese.
- Switch between dark and light mode.

## How To Use

1. Open the app.
2. Search for the ETF you want to test, such as `QQQ`, `SPY`, or `VOO`.
3. Click a search result to add it to the selected asset pool.
4. Configure each asset card:
   - choose the DCA start and end dates
   - choose daily, weekly, or monthly frequency
   - enter the contribution amount
   - turn the asset on or off
5. Click **Run backtest**.
6. Review:
   - result summary
   - total invested
   - final portfolio value
   - total return
   - annualized return
   - maximum drawdown
   - SPY comparison
   - portfolio chart and optional ETF K-line overlay

Clicking an already selected K-line ticker again hides the ETF K-line view, leaving only the portfolio result chart.

## Local Preview

This project does not require a build step or package installation for normal local preview.

Requirements:

- Node.js 22 or newer is recommended.

Run:

```bash
node scripts/serve-local.mjs
```

Then open:

```text
http://127.0.0.1:5173/
```

To use another port:

```bash
node scripts/serve-local.mjs 5174
```

Opening `index.html` directly may work for basic UI testing, but the local server is recommended because the app loads JSON data files from the `data/` directory.

## Backtest Logic

All backtest calculations run in the browser.

The app:

1. Loads ETF metadata from `data/manifest.json` and `data/etf-universe.json`.
2. Loads daily price files from `data/prices/{SYMBOL}.json`.
3. Builds a unified trading timeline from the selected assets.
4. Generates DCA contribution events for each asset independently.
5. Executes buys on the next available trading day when needed.
6. Tracks:
   - contributed capital
   - executed buys
   - shares held per ETF
   - idle cash
   - holdings value
   - total portfolio value
7. Calculates portfolio-level metrics:
   - total invested
   - final value
   - total return
   - annualized return / XIRR-style return
   - maximum drawdown
   - SPY benchmark comparison

The result is a single combined portfolio curve, even when different ETFs use different dates, frequencies, and amounts.

## Data Update Logic

SmileDCA uses static JSON data for fast browser loading, plus an optional Cloudflare-backed fallback for missing price files.

Data sources:

- ETF universe: Nasdaq Trader Symbol Directory
- Daily OHLC price data: Yahoo Finance Chart API

Update local data:

```bash
node scripts/update-data.mjs
```

Refresh or add specific symbols:

```bash
node scripts/update-data.mjs --symbols=QQQ,SPY,TLT
```

This script updates:

- `data/etf-universe.json`
- `data/manifest.json`
- `data/prices/*.json`

The GitHub Actions workflow `.github/workflows/smiledca-update-data.yml` can run this automatically after the US market close. It can also be triggered manually from GitHub Actions with optional symbols.

## Deployment

The app is designed for static hosting.

Current deployment path:

- Cloudflare Pages hosts the static frontend.
- GitHub Actions deploys `index.html`, `_headers`, `data/`, and `pages/_worker.js`.
- Cloudflare Pages Functions handle `/api/price`.
- Optional Cloudflare R2 stores cached price JSON for symbols that are not already committed under `data/prices/`.

Required GitHub repository secrets for Cloudflare deployment:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

Optional R2 secret:

```text
CLOUDFLARE_R2_BUCKET
```

If R2 is configured, missing ETF price files can be fetched on demand through `/api/price?symbol=SYMBOL` and then cached in R2.

## Technical Framework

SmileDCA is intentionally simple:

- Single-page frontend: `index.html`
- No frontend framework
- Vanilla HTML, CSS, and JavaScript
- Canvas 2D for charts
- `localStorage` for user preferences and saved strategy state
- `IndexedDB` for browser-side JSON data cache
- Static JSON files for market data
- GitHub Actions for scheduled data updates and deployment
- Cloudflare Pages for hosting
- Cloudflare Pages Functions / Worker for optional price proxy
- Cloudflare R2 for optional object storage

Important files:

```text
index.html                              Main app UI, state, charts, and backtest logic
assets/SmileDCA-logo.png                App logo
data/manifest.json                      Cached price data manifest
data/etf-universe.json                  Searchable ETF universe
data/prices/*.json                      Daily ETF OHLC data
scripts/serve-local.mjs                 Local static server
scripts/update-data.mjs                 Market data update script
pages/_worker.js                        Cloudflare Pages Function for /api/price
workers/smiledca-price-worker.js        Standalone Worker version of the price proxy
.github/workflows/*.yml                 Data update and Cloudflare deployment workflows
```

## Notes

SmileDCA is an educational backtesting tool. Historical performance does not represent future returns, and this project does not provide investment advice.
