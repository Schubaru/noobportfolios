/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAlpacaConfig, missingKeysResponse, alpacaFetch } from '../_shared/alpaca.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CACHE_TTL = 120_000; // 2 min

interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  prevClose: number;
  timestamp: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const cfg = getAlpacaConfig();
    if (!cfg) return missingKeysResponse(corsHeaders);

    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get('symbols');
    if (!symbolsParam) {
      return new Response(JSON.stringify({ error: 'Missing required parameter: symbols (comma-separated)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (symbols.length === 0) {
      return new Response(JSON.stringify({ quotes: {} }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (symbols.length > 50) {
      return new Response(JSON.stringify({ error: 'Maximum 50 symbols per request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Use service role to access symbol_quote_cache
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = Date.now();
    const quotes: Record<string, QuoteData> = {};
    const errors: Record<string, string> = {};

    // 1. Read from DB cache
    const { data: cached } = await supabase
      .from('symbol_quote_cache')
      .select('*')
      .in('symbol', symbols);

    const cachedMap = new Map<string, any>();
    for (const row of (cached || [])) {
      cachedMap.set(row.symbol, row);
    }

    const toFetch: string[] = [];
    for (const sym of symbols) {
      const row = cachedMap.get(sym);
      if (row) {
        const age = now - new Date(row.updated_at).getTime();
        if (age < CACHE_TTL) {
          // Fresh — build QuoteData from cache
          const price = Number(row.price);
          const prevClose = Number(row.prev_close || 0);
          const change = prevClose ? price - prevClose : 0;
          const changePct = prevClose ? (change / prevClose) * 100 : 0;
          quotes[sym] = {
            symbol: sym,
            price,
            change: Math.round(change * 100) / 100,
            changePct: Math.round(changePct * 100) / 100,
            dayHigh: Number(row.day_high || price),
            dayLow: Number(row.day_low || price),
            dayOpen: Number(row.day_open || price),
            prevClose,
            timestamp: new Date(row.updated_at).getTime(),
          };
          continue;
        }
      }
      toFetch.push(sym);
    }

    // 2. Fetch stale/missing from Alpaca
    if (toFetch.length > 0) {
      const res = await alpacaFetch('/v2/stocks/snapshots', cfg, {
        symbols: toFetch.join(','),
        feed: 'iex',
      });

      if (res.ok) {
        const snapshots = await res.json();
        const upsertRows: any[] = [];

        for (const sym of toFetch) {
          const snap = snapshots[sym];
          if (!snap) {
            // Use stale cache if available
            const stale = cachedMap.get(sym);
            if (stale) {
              const price = Number(stale.price);
              const prevClose = Number(stale.prev_close || 0);
              const change = prevClose ? price - prevClose : 0;
              const changePct = prevClose ? (change / prevClose) * 100 : 0;
              quotes[sym] = {
                symbol: sym, price, change: Math.round(change * 100) / 100,
                changePct: Math.round(changePct * 100) / 100,
                dayHigh: Number(stale.day_high || price), dayLow: Number(stale.day_low || price),
                dayOpen: Number(stale.day_open || price), prevClose,
                timestamp: new Date(stale.updated_at).getTime(),
              };
            } else {
              errors[sym] = 'No data available';
            }
            continue;
          }

          const price = snap.latestTrade?.p ?? snap.minuteBar?.c ?? snap.dailyBar?.c ?? 0;
          const prevClose = snap.prevDailyBar?.c ?? 0;
          const change = prevClose ? price - prevClose : 0;
          const changePct = prevClose ? (change / prevClose) * 100 : 0;

          quotes[sym] = {
            symbol: sym,
            price,
            change: Math.round(change * 100) / 100,
            changePct: Math.round(changePct * 100) / 100,
            dayHigh: snap.dailyBar?.h ?? price,
            dayLow: snap.dailyBar?.l ?? price,
            dayOpen: snap.dailyBar?.o ?? price,
            prevClose,
            timestamp: snap.latestTrade?.t ? new Date(snap.latestTrade.t).getTime() : now,
          };

          upsertRows.push({
            symbol: sym,
            price,
            prev_close: prevClose || null,
            day_high: snap.dailyBar?.h ?? null,
            day_low: snap.dailyBar?.l ?? null,
            day_open: snap.dailyBar?.o ?? null,
            updated_at: new Date().toISOString(),
          });
        }

        // Upsert to shared cache
        if (upsertRows.length > 0) {
          await supabase
            .from('symbol_quote_cache')
            .upsert(upsertRows, { onConflict: 'symbol' });
        }
      } else {
        for (const sym of toFetch) {
          const stale = cachedMap.get(sym);
          if (stale) {
            const price = Number(stale.price);
            const prevClose = Number(stale.prev_close || 0);
            const change = prevClose ? price - prevClose : 0;
            const changePct = prevClose ? (change / prevClose) * 100 : 0;
            quotes[sym] = {
              symbol: sym, price, change: Math.round(change * 100) / 100,
              changePct: Math.round(changePct * 100) / 100,
              dayHigh: Number(stale.day_high || price), dayLow: Number(stale.day_low || price),
              dayOpen: Number(stale.day_open || price), prevClose,
              timestamp: new Date(stale.updated_at).getTime(),
            };
          } else {
            errors[sym] = `API error: ${res.status}`;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ quotes, errors: Object.keys(errors).length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('market-quote-batch error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
