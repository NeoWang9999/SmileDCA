import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { platform } from "node:os";

const defaultCachedSymbols = [
  { symbol: "QQQ", name: "Invesco QQQ Trust", color: "#9b7cff" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", color: "#ffd27a" },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", color: "#64d8ff" },
  { symbol: "SPMO", name: "Invesco S&P 500 Momentum", color: "#ff6b9d" },
  { symbol: "SMH", name: "VanEck Semiconductor ETF", color: "#87f0b0" }
];

const source = {
  name: "Yahoo Finance Chart API",
  url: "https://query1.finance.yahoo.com/v8/finance/chart",
  note: "Free development source for a small open-source/self-use deployment."
};

const universeSource = {
  name: "Nasdaq Trader Symbol Directory",
  urls: [
    "https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt",
    "https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt"
  ]
};

const outputDir = new URL("../data/", import.meta.url);
const priceDir = new URL("../data/prices/", import.meta.url);
const manifestUrl = new URL("../data/manifest.json", import.meta.url);

function toDate(timestamp) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
}

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function cleanSecurityName(name) {
  return String(name || "")
    .replace(/\s+-\s+ETF$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function symbolColor(symbol) {
  let hash = 0;
  for (const char of symbol) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return `hsl(${hash} 84% 68%)`;
}

function requestWithCurl(url) {
  const executable = platform() === "win32" ? "curl.exe" : "curl";
  const args = [
    "-L",
    "--fail",
    "--silent",
    "--show-error",
    "-A",
    "Mozilla/5.0",
    url
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    const chunks = [];
    const errors = [];

    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString("utf8"));
        return;
      }

      reject(new Error(`curl exited with ${code}: ${Buffer.concat(errors).toString("utf8")}`));
    });
  });
}

function parsePipeFile(content) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("File Creation Time"));

  const header = lines.shift()?.split("|") || [];
  return lines
    .filter((line) => !line.startsWith("Symbol|") && !line.startsWith("ACT Symbol|"))
    .map((line) => {
      const values = line.split("|");
      return Object.fromEntries(header.map((key, index) => [key, values[index] || ""]));
    });
}

async function fetchEtfUniverse() {
  const [nasdaqText, otherText] = await Promise.all(universeSource.urls.map(requestWithCurl));
  const nasdaq = parsePipeFile(nasdaqText)
    .filter((row) => row["ETF"] === "Y" && row["Test Issue"] !== "Y")
    .map((row) => ({
      symbol: normalizeSymbol(row["Symbol"]),
      name: cleanSecurityName(row["Security Name"]),
      exchange: "NASDAQ"
    }));

  const other = parsePipeFile(otherText)
    .filter((row) => row["ETF"] === "Y" && row["Test Issue"] !== "Y")
    .map((row) => ({
      symbol: normalizeSymbol(row["ACT Symbol"]),
      name: cleanSecurityName(row["Security Name"]),
      exchange: row["Exchange"] || ""
    }));

  const bySymbol = new Map();
  [...nasdaq, ...other].forEach((item) => {
    if (!item.symbol || bySymbol.has(item.symbol)) return;
    bySymbol.set(item.symbol, {
      ...item,
      color: symbolColor(item.symbol),
      cached: false,
      source: universeSource.name
    });
  });

  defaultCachedSymbols.forEach((item) => {
    const existing = bySymbol.get(item.symbol) || {};
    bySymbol.set(item.symbol, {
      symbol: item.symbol,
      name: existing.name || item.name,
      exchange: existing.exchange || "",
      color: item.color,
      cached: false,
      source: existing.source || universeSource.name
    });
  });

  return Array.from(bySymbol.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

async function readExistingManifestSymbols() {
  try {
    const payload = JSON.parse(await readFile(manifestUrl, "utf8"));
    return Array.isArray(payload.symbols) ? payload.symbols : [];
  } catch {
    return [];
  }
}

async function fetchChart(symbol) {
  const url = `${source.url}/${symbol}?range=30y&interval=1d&events=history&includeAdjustedClose=true`;
  const body = await requestWithCurl(url);
  const payload = JSON.parse(body);
  const result = payload?.chart?.result?.[0];
  const error = payload?.chart?.error;
  if (!result || error) {
    throw new Error(`${symbol}: ${error?.description || "empty data response"}`);
  }

  if (result.meta?.dataGranularity !== "1d") {
    throw new Error(`${symbol}: expected daily data, received ${result.meta?.dataGranularity || "unknown granularity"}`);
  }

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const adjClose = result.indicators?.adjclose?.[0]?.adjclose || [];

  const rows = timestamps
    .map((timestamp, index) => ({
      date: toDate(timestamp),
      open: round(quote.open?.[index]),
      high: round(quote.high?.[index]),
      low: round(quote.low?.[index]),
      close: round(quote.close?.[index]),
      adjClose: round(adjClose[index] ?? quote.close?.[index]),
      volume: Number.isFinite(quote.volume?.[index]) ? quote.volume[index] : null
    }))
    .filter((row) =>
      row.date &&
      row.open !== null &&
      row.high !== null &&
      row.low !== null &&
      row.close !== null &&
      row.adjClose !== null
    );

  if (!rows.length) {
    throw new Error(`${symbol}: no valid daily rows`);
  }

  return rows;
}

function cachedSymbolsFromArgs(existingManifestSymbols) {
  const explicit = process.argv
    .find((arg) => arg.startsWith("--symbols="))
    ?.slice("--symbols=".length)
    .split(",")
    .map(normalizeSymbol)
    .filter(Boolean);

  const existing = existingManifestSymbols.map((item) => normalizeSymbol(item.symbol)).filter(Boolean);
  return Array.from(new Set([...defaultCachedSymbols.map((item) => item.symbol), ...existing, ...(explicit || [])]));
}

async function main() {
  await mkdir(priceDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const existingManifestSymbols = await readExistingManifestSymbols();
  const cachedSymbols = cachedSymbolsFromArgs(existingManifestSymbols);

  console.log("Fetching ETF universe...");
  const universe = await fetchEtfUniverse();
  const universeBySymbol = new Map(universe.map((item) => [item.symbol, item]));
  const defaultBySymbol = new Map(defaultCachedSymbols.map((item) => [item.symbol, item]));
  const existingBySymbol = new Map(existingManifestSymbols.map((item) => [normalizeSymbol(item.symbol), item]));
  const manifestSymbols = [];
  const failures = [];

  for (const symbol of cachedSymbols) {
    const fallback = defaultBySymbol.get(symbol) || universeBySymbol.get(symbol);
    if (!fallback) continue;

    try {
      console.log(`Fetching ${symbol}...`);
      const rows = await fetchChart(symbol);
      await writeFile(
        new URL(`prices/${symbol}.json`, outputDir),
        `${JSON.stringify({ symbol, source: source.name, generatedAt, rows })}\n`,
        "utf8"
      );

      const first = rows[0];
      const latest = rows.at(-1);
      manifestSymbols.push({
        symbol,
        name: fallback.name,
        color: fallback.color || symbolColor(symbol),
        exchange: fallback.exchange || "",
        startDate: first.date,
        endDate: latest.date,
        rows: rows.length,
        latestClose: latest.adjClose,
        pricePath: `data/prices/${symbol}.json`,
        cached: true
      });
    } catch (error) {
      console.warn(error.message);
      failures.push({ symbol, error: error.message });
      const existing = existingBySymbol.get(symbol);
      if (existing) {
        manifestSymbols.push({ ...existing, stale: true, lastError: error.message });
      }
    }
  }

  const cachedManifestBySymbol = new Map(manifestSymbols.map((item) => [item.symbol, item]));
  const searchableUniverse = universe.map((item) => {
    const cached = cachedManifestBySymbol.get(item.symbol);
    return {
      ...item,
      color: cached?.color || item.color,
      cached: Boolean(cached),
      startDate: cached?.startDate || null,
      endDate: cached?.endDate || null,
      pricePath: cached?.pricePath || `data/prices/${item.symbol}.json`
    };
  });

  await writeFile(
    new URL("etf-universe.json", outputDir),
    `${JSON.stringify({
      generatedAt,
      source: universeSource,
      count: searchableUniverse.length,
      symbols: searchableUniverse
    })}\n`,
    "utf8"
  );

  await writeFile(
    manifestUrl,
    `${JSON.stringify({
      generatedAt,
      source,
      universeSource,
      universePath: "data/etf-universe.json",
      priceBasePath: "data/prices/",
      symbols: manifestSymbols.sort((a, b) => a.symbol.localeCompare(b.symbol)),
      failures
    })}\n`,
    "utf8"
  );

  console.log(`Updated ${manifestSymbols.length} cached price files and ${searchableUniverse.length} ETF universe entries at ${generatedAt}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
