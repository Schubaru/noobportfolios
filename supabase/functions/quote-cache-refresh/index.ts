/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAlpacaConfig, missingKeysResponse, alpacaFetch } from '../_shared/alpaca.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CachedQuote {
  symbol: string;
  price: number;
  prev_close: number | null;
  day_high: number | null;
  day_low: number | null;
  day_open: number | null;
  updated_at: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const cfg = getAlpacaConfig();
    if (!cfg) return missingKeysResponse(corsHeaders);

    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get('symbols');
    const maxAgeMs = parseInt(url.searchParams.get('max_age_ms') || '15000', 10);

    if (!symbolsParam) {
      return new Response(JSON.stringify({ error: 'Missing required parameter: symbols' }),
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

    // Use service role to access symbol_quote_cache (RLS-protected, no anon policies)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Read cached quotes
    const { data: cached } = await supabase
      .from('symbol_quote_cache')
      .select('*')
      .in('symbol', symbols);

    const now = Date.now();
    const quotes: Record<string, CachedQuote> = {};
    const staleSymbols: string[] = [];

    // Partition into fresh vs stale
    const cachedMap = new Map<string, CachedQuote>();
    for (const row of (cached || [])) {
      cachedMap.set(row.symbol, row);
    }

    for (const sym of symbols) {
      const row = cachedMap.get(sym);
      if (row) {
        const age = now - new Date(row.updated_at).getTime();
        if (age < maxAgeMs) {
          quotes[sym] = row;
        } else {
          staleSymbols.push(sym);
        }
      } else {
        staleSymbols.push(sym);
      }
    }

    // 2. Fetch stale symbols from Alpaca in ONE call
    if (staleSymbols.length > 0) {
      const res = await alpacaFetch('/v2/stocks/snapshots', cfg, {
        symbols: staleSymbols.join(','),
        feed: 'iex',
      });

      if (res.ok) {
        const snapshots = await res.json();
        const upsertRows: CachedQuote[] = [];

        for (const sym of staleSymbols) {
          const snap = snapshots[sym];
          if (!snap) {
            // No data from Alpaca - use stale cache if available
            const stale = cachedMap.get(sym);
            if (stale) quotes[sym] = stale;
            continue;
          }

          const price = snap.latestTrade?.p ?? snap.minuteBar?.c ?? snap.dailyBar?.c ?? 0;
          const row: CachedQuote = {
            symbol: sym,
            price,
            prev_close: snap.prevDailyBar?.c ?? null,
            day_high: snap.dailyBar?.h ?? null,
            day_low: snap.dailyBar?.l ?? null,
            day_open: snap.dailyBar?.o ?? null,
            updated_at: new Date().toISOString(),
          };

          quotes[sym] = row;
          upsertRows.push(row);
        }

        // Batch upsert to DB
        if (upsertRows.length > 0) {
          await supabase
            .from('symbol_quote_cache')
            .upsert(upsertRows, { onConflict: 'symbol' });
        }
      } else {
        // API failed — use stale cache for anything we have
        for (const sym of staleSymbols) {
          const stale = cachedMap.get(sym);
          if (stale) quotes[sym] = stale;
        }
      }
    }

    return new Response(JSON.stringify({ quotes }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('quote-cache-refresh error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
