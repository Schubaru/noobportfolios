/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { getAlpacaConfig, missingKeysResponse, alpacaFetch } from '../_shared/alpaca.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const cache = new Map<string, { data: unknown; expiry: number }>();

function cacheTTL(timeframe: string): number {
  // Intraday = 5 min, daily+ = 1 hour
  return timeframe === '1Day' || timeframe === '1Week' || timeframe === '1Month'
    ? 60 * 60_000
    : 5 * 60_000;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const cfg = getAlpacaConfig();
    if (!cfg) return missingKeysResponse(corsHeaders);

    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol')?.toUpperCase();
    const from = url.searchParams.get('from'); // unix seconds or ISO
    const to = url.searchParams.get('to');     // unix seconds or ISO
    let resolution = url.searchParams.get('resolution') || 'D';

    if (!symbol || !from || !to) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: symbol, from, to' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Map legacy Finnhub resolution codes to Alpaca timeframes
    const timeframeMap: Record<string, string> = {
      '1': '1Min', '5': '5Min', '15': '15Min', '30': '30Min', '60': '1Hour',
      'D': '1Day', 'W': '1Week', 'M': '1Month',
      // Also accept Alpaca native values
      '1Min': '1Min', '5Min': '5Min', '15Min': '15Min', '30Min': '30Min',
      '1Hour': '1Hour', '1Day': '1Day', '1Week': '1Week', '1Month': '1Month',
    };
    const timeframe = timeframeMap[resolution] || '1Day';

    // Convert unix seconds to ISO if needed
    const startISO = /^\d+$/.test(from)
      ? new Date(Number(from) * 1000).toISOString()
      : from;
    const endISO = /^\d+$/.test(to)
      ? new Date(Number(to) * 1000).toISOString()
      : to;

    const cacheKey = `bars:${symbol}:${timeframe}:${startISO}:${endISO}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return new Response(JSON.stringify(cached.data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`Fetching Alpaca bars for ${symbol} (${timeframe}) ${startISO} → ${endISO}`);

    // Alpaca bars endpoint — paginate via next_page_token
    let allBars: { t: string; c: number }[] = [];
    let pageToken: string | undefined;
    const MAX_PAGES = 5;

    for (let page = 0; page < MAX_PAGES; page++) {
      const params: Record<string, string> = {
        symbols: symbol,
        timeframe,
        start: startISO,
        end: endISO,
        limit: '10000',
        adjustment: 'split',
        feed: 'iex',
        sort: 'asc',
      };
      if (pageToken) params.page_token = pageToken;

      const res = await alpacaFetch('/v2/stocks/bars', cfg, params);

      if (!res.ok) {
        console.error(`Alpaca bars error: ${res.status}`);
        if (res.status === 403 || res.status === 422) {
          return new Response(
            JSON.stringify({ error: `Historical data not available for ${symbol}`, symbol }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(
          JSON.stringify({ error: 'Failed to fetch historical price data' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const data = await res.json();
      const bars = data.bars?.[symbol] || [];
      for (const b of bars) {
        allBars.push({ t: b.t, c: b.c });
      }

      pageToken = data.next_page_token;
      if (!pageToken) break;
    }

    if (allBars.length === 0) {
      return new Response(
        JSON.stringify({ error: `No historical data available for: ${symbol}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Normalize to existing frontend contract
    const candles = allBars.map(b => ({
      timestamp: new Date(b.t).getTime(),
      close: b.c,
    }));

    const normalized = { symbol, resolution: timeframe, candles };
    cache.set(cacheKey, { data: normalized, expiry: Date.now() + cacheTTL(timeframe) });

    console.log(`Returning ${candles.length} candles for ${symbol}`);
    return new Response(JSON.stringify(normalized),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('market-history error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
