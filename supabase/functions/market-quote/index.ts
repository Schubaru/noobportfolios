/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { getAlpacaConfig, missingKeysResponse, alpacaFetch } from '../_shared/alpaca.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 60_000; // 60s

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const cfg = getAlpacaConfig();
    if (!cfg) return missingKeysResponse(corsHeaders);

    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol')?.toUpperCase();
    if (!symbol) {
      return new Response(JSON.stringify({ error: 'Missing required parameter: symbol' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check cache
    const cacheKey = `quote:${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return new Response(JSON.stringify(cached.data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const res = await alpacaFetch(`/v2/stocks/${encodeURIComponent(symbol)}/snapshot`, cfg);

    if (!res.ok) {
      // Return stale cache if available
      if (cached) {
        return new Response(JSON.stringify(cached.data),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache-Status': 'stale' } });
      }
      return new Response(JSON.stringify({ error: `Alpaca error: ${res.status}` }),
        { status: res.status >= 400 && res.status < 500 ? res.status : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const snap = await res.json();

    // Extract price: latestTrade.p -> minuteBar.c -> dailyBar.c
    const price = snap.latestTrade?.p ?? snap.minuteBar?.c ?? snap.dailyBar?.c ?? 0;
    const prevClose = snap.prevDailyBar?.c ?? 0;
    const change = prevClose ? price - prevClose : 0;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;

    const normalized = {
      symbol,
      price,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      dayHigh: snap.dailyBar?.h ?? price,
      dayLow: snap.dailyBar?.l ?? price,
      dayOpen: snap.dailyBar?.o ?? price,
      prevClose,
      timestamp: snap.latestTrade?.t ? new Date(snap.latestTrade.t).getTime() : Date.now(),
    };

    cache.set(cacheKey, { data: normalized, expiry: Date.now() + CACHE_TTL });

    return new Response(JSON.stringify(normalized),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('market-quote error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
