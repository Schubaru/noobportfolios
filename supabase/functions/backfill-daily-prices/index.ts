const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FINNHUB_KEY = Deno.env.get('FINNHUB_API_KEY') || '';

interface CandleResponse {
  c: number[];  // close prices
  t: number[];  // timestamps
  s: string;    // status
}

async function fetchDailyCandles(symbol: string, from: number, to: number): Promise<Map<string, number>> {
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return new Map();
  
  const data: CandleResponse = await res.json();
  if (data.s !== 'ok' || !data.c || !data.t) return new Map();
  
  const prices = new Map<string, number>();
  for (let i = 0; i < data.t.length; i++) {
    const d = new Date(data.t[i] * 1000);
    const dateStr = d.toISOString().split('T')[0];
    prices.set(dateStr, data.c[i]);
  }
  return prices;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY);

    // Accept symbols + date range, or auto-detect from holdings_history
    const body = req.method === 'POST' ? await req.json() : {};
    let symbols: string[] = body.symbols || [];
    const fromDate: string | undefined = body.from_date;
    const toDate: string | undefined = body.to_date;

    // If no symbols provided, get all unique symbols from holdings_history
    if (symbols.length === 0) {
      const { data: rows } = await serviceClient
        .from('holdings_history')
        .select('symbol');
      if (rows) {
        symbols = [...new Set(rows.map((r: any) => r.symbol))];
      }
    }

    if (symbols.length === 0) {
      return new Response(JSON.stringify({ message: 'No symbols to backfill' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const to = Math.floor(now.getTime() / 1000);
    // Default: backfill last 365 days
    const fromTs = fromDate 
      ? Math.floor(new Date(fromDate).getTime() / 1000) 
      : to - 365 * 24 * 60 * 60;

    let totalInserted = 0;
    const errors: string[] = [];

    for (const symbol of symbols) {
      try {
        // Check what dates we already have
        const { data: existing } = await serviceClient
          .from('symbol_daily_prices')
          .select('date')
          .eq('symbol', symbol)
          .gte('date', fromDate || new Date(fromTs * 1000).toISOString().split('T')[0])
          .lte('date', todayStr);

        const existingDates = new Set((existing || []).map((r: any) => r.date));

        // Fetch candles from Finnhub
        const prices = await fetchDailyCandles(symbol, fromTs, to);
        
        // Insert missing dates
        const toInsert: { symbol: string; date: string; close_price: number }[] = [];
        for (const [date, price] of prices) {
          if (!existingDates.has(date) && date !== todayStr) {
            toInsert.push({ symbol, date, close_price: price });
          }
        }

        if (toInsert.length > 0) {
          const { error: insertErr } = await serviceClient
            .from('symbol_daily_prices')
            .upsert(toInsert, { onConflict: 'symbol,date' });
          if (insertErr) {
            errors.push(`${symbol}: ${insertErr.message}`);
          } else {
            totalInserted += toInsert.length;
          }
        }

        // Rate limit: 200ms between symbols
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        errors.push(`${symbol}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({
      symbols_processed: symbols.length,
      prices_inserted: totalInserted,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('backfill-daily-prices error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
