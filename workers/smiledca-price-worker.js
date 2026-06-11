const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=3600"
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

function validateSymbol(symbol) {
  return /^[A-Z0-9.-]{1,16}$/.test(symbol);
}

function toDate(timestamp) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
}

async function fetchChart(symbol) {
  const url = `${YAHOO_CHART_URL}/${symbol}?range=30y&interval=1d&events=history&includeAdjustedClose=true`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  if (!response.ok) {
    throw new Error(`${symbol}: source returned ${response.status}`);
  }

  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const error = payload?.chart?.error;
  if (!result || error) {
    throw new Error(`${symbol}: ${error?.description || "empty data response"}`);
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

  return {
    symbol,
    source: "Yahoo Finance Chart API",
    generatedAt: new Date().toISOString(),
    rows
  };
}

function symbolFromRequest(request) {
  const url = new URL(request.url);
  const querySymbol = normalizeSymbol(url.searchParams.get("symbol"));
  if (querySymbol) return querySymbol;

  const match = url.pathname.match(/\/prices\/([A-Za-z0-9.-]+)\.json$/);
  return normalizeSymbol(match?.[1]);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const symbol = symbolFromRequest(request);
    if (!validateSymbol(symbol)) {
      return jsonResponse({ error: "Invalid symbol" }, 400);
    }

    if (!env.SMILEDCA_DATA) {
      return jsonResponse({ error: "R2 bucket binding SMILEDCA_DATA is not configured" }, 500);
    }

    const key = `data/prices/${symbol}.json`;
    const cached = await env.SMILEDCA_DATA.get(key);
    if (cached) {
      return new Response(cached.body, {
        headers: {
          ...corsHeaders(),
          "Content-Type": "application/json; charset=utf-8"
        }
      });
    }

    try {
      const payload = await fetchChart(symbol);
      const body = `${JSON.stringify(payload)}\n`;
      await env.SMILEDCA_DATA.put(key, body, {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
        customMetadata: {
          symbol,
          generatedAt: payload.generatedAt
        }
      });

      return new Response(body, {
        headers: {
          ...corsHeaders(),
          "Content-Type": "application/json; charset=utf-8"
        }
      });
    } catch (error) {
      return jsonResponse({ error: error?.message || "Price data unavailable" }, 502);
    }
  }
};
