/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { getAlpacaConfig, missingKeysResponse, alpacaFetch } from '../_shared/alpaca.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const cache = new Map<string, { data: unknown; expiry: number }>();
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

    const now = Date.now();
    const quotes: Record<string, QuoteData> = {};
    const errors: Record<string, string> = {};
    const toFetch: string[] = [];

    // Check cache first
    for (const sym of symbols) {
      const cached = cache.get(`quote:${sym}`);
      if (cached && cached.expiry > now) {
        quotes[sym] = cached.data as QuoteData;
      } else {
        toFetch.push(sym);
      }
    }

    if (toFetch.length > 0) {
      // Single Alpaca call for all uncached symbols
      const res = await alpacaFetch('/v2/stocks/snapshots', cfg, {
        symbols: toFetch.join(','),
      });

      if (res.ok) {
        const snapshots = await res.json();
        for (const sym of toFetch) {
          const snap = snapshots[sym];
          if (!snap) {
            errors[sym] = 'No data available';
            continue;
          }

          const price = snap.latestTrade?.p ?? snap.minuteBar?.c ?? snap.dailyBar?.c ?? 0;
          const prevClose = snap.prevDailyBar?.c ?? 0;
          const change = prevClose ? price - prevClose : 0;
          const changePct = prevClose ? (change / prevClose) * 100 : 0;

          const normalized: QuoteData = {
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

          quotes[sym] = normalized;
          cache.set(`quote:${sym}`, { data: normalized, expiry: now + CACHE_TTL });
        }
      } else {
        // API failed — mark all unfetched as errors, use stale cache if available
        for (const sym of toFetch) {
          const stale = cache.get(`quote:${sym}`);
          if (stale) {
            quotes[sym] = stale.data as QuoteData;
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
