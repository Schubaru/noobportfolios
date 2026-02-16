const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Range = '1D' | '1W' | '1M' | 'ALL';

function rangeToMs(range: Range): number {
  switch (range) {
    case '1D': return 24 * 60 * 60 * 1000;
    case '1W': return 7 * 24 * 60 * 60 * 1000;
    case '1M': return 30 * 24 * 60 * 60 * 1000;
    case 'ALL': return 0;
  }
}

function maxPoints(range: Range): number {
  switch (range) {
    case '1D': return 200;
    case '1W': return 168;
    case '1M': return 180;
    case 'ALL': return 200;
  }
}

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const result: T[] = [];
  const step = (arr.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    result.push(arr[Math.round(i * step)]);
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await client.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const portfolioId = url.searchParams.get('portfolio_id');
    const range = (url.searchParams.get('range') || '1D') as Range;

    if (!portfolioId) {
      return new Response(JSON.stringify({ error: 'Missing portfolio_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // RLS will filter by user automatically
    const now = Date.now();
    const rangeMs = rangeToMs(range);
    const from = range === 'ALL' ? new Date(0).toISOString() : new Date(now - rangeMs).toISOString();

    const { data: rows, error } = await client
      .from('value_history')
      .select('id, recorded_at, value, invested_value, cost_basis, unrealized_pl, source')
      .eq('portfolio_id', portfolioId)
      .gte('recorded_at', from)
      .order('recorded_at', { ascending: true });

    if (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch data' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!rows || rows.length < 2) {
      // Get first snapshot ever for info
      const { data: first } = await client
        .from('value_history')
        .select('recorded_at')
        .eq('portfolio_id', portfolioId)
        .order('recorded_at', { ascending: true })
        .limit(1);

      return new Response(JSON.stringify({
        points: rows?.map(r => ({
          t: r.recorded_at,
          v: Number(r.value),
          hv: r.invested_value != null ? Number(r.invested_value) : null,
          cb: r.cost_basis != null ? Number(r.cost_basis) : null,
          source: r.source,
        })) || [],
        range,
        available: false,
        first_snapshot_at: first?.[0]?.recorded_at || null,
        message: `Not enough data for ${range} view yet. Keep checking in to build your chart.`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const points = rows.map(r => ({
      t: r.recorded_at,
      v: Number(r.value),
      hv: r.invested_value != null ? Number(r.invested_value) : null,
      cb: r.cost_basis != null ? Number(r.cost_basis) : null,
      source: r.source,
    }));

    const downsampled = downsample(points, maxPoints(range));

    return new Response(JSON.stringify({
      points: downsampled,
      range,
      available: true,
      first_snapshot_at: rows[0].recorded_at,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('portfolio-performance error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
