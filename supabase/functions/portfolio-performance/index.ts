const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Range = '1D' | '1W' | '1M' | 'ALL';

interface Point {
  t: string;
  v: number;
  hv: number | null;
  cb: number | null;
  source: string | null;
}

function rangeToMs(range: Range): number {
  switch (range) {
    case '1D': return 24 * 60 * 60 * 1000;
    case '1W': return 7 * 24 * 60 * 60 * 1000;
    case '1M': return 30 * 24 * 60 * 60 * 1000;
    case 'ALL': return 0;
  }
}

/** Bucket size in ms for time-bucket downsampling */
function bucketMs(range: Range): number {
  switch (range) {
    case '1D': return 5 * 60 * 1000;       // 5 min
    case '1W': return 60 * 60 * 1000;      // 1 hour
    case '1M': return 4 * 60 * 60 * 1000;  // 4 hours
    case 'ALL': return 24 * 60 * 60 * 1000; // 1 day
  }
}

function maxPoints(range: Range): number {
  switch (range) {
    case '1D': return 288;
    case '1W': return 168;
    case '1M': return 180;
    case 'ALL': return 365;
  }
}

/** Time-bucket downsample: for each bucket take the last point */
function timeBucketDownsample(points: Point[], bucket: number, max: number): Point[] {
  if (points.length <= max) return points;

  // Group by bucket, take last in each bucket
  const buckets = new Map<number, Point>();
  for (const p of points) {
    const t = new Date(p.t).getTime();
    const key = Math.floor(t / bucket);
    buckets.set(key, p); // last point wins
  }

  let result = Array.from(buckets.values());
  result.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());

  // Trim if still over max
  if (result.length > max) {
    const step = (result.length - 1) / (max - 1);
    const trimmed: Point[] = [];
    for (let i = 0; i < max; i++) {
      trimmed.push(result[Math.round(i * step)]);
    }
    result = trimmed;
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

    const now = Date.now();
    const rangeMs = rangeToMs(range);
    const from = range === 'ALL' ? new Date(0).toISOString() : new Date(now - rangeMs).toISOString();

    // First try: only 'good' quality rows
    let { data: rows, error } = await client
      .from('value_history')
      .select('id, recorded_at, value, invested_value, cost_basis, source, quality')
      .eq('portfolio_id', portfolioId)
      .gte('recorded_at', from)
      .in('quality', ['good'])
      .order('recorded_at', { ascending: true });

    if (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch data' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let coverageNotes: string | null = null;

    // If fewer than 2 good rows, include degraded
    if (!rows || rows.length < 2) {
      const { data: fallbackRows } = await client
        .from('value_history')
        .select('id, recorded_at, value, invested_value, cost_basis, source, quality')
        .eq('portfolio_id', portfolioId)
        .gte('recorded_at', from)
        .in('quality', ['good', 'degraded'])
        .order('recorded_at', { ascending: true });

      if (fallbackRows && fallbackRows.length >= 2) {
        rows = fallbackRows;
        const degradedCount = fallbackRows.filter(r => r.quality === 'degraded').length;
        coverageNotes = `Includes ${degradedCount} degraded-quality point(s) due to limited good data.`;
      }
    }

    if (!rows || rows.length < 2) {
      // Get first snapshot ever
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
        coverage_notes: coverageNotes,
        message: `Not enough data for ${range} view yet. Keep checking in to build your chart.`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Separate trade points and regular points ──
    const tradePoints: Point[] = [];
    const regularPoints: Point[] = [];

    for (const r of rows) {
      const p: Point = {
        t: r.recorded_at,
        v: Number(r.value),
        hv: r.invested_value != null ? Number(r.invested_value) : null,
        cb: r.cost_basis != null ? Number(r.cost_basis) : null,
        source: r.source,
      };
      if (r.source === 'trade') {
        tradePoints.push(p);
      } else {
        regularPoints.push(p);
      }
    }

    // ── Time-bucket downsample regular points ──
    const bucket = bucketMs(range);
    const max = maxPoints(range);
    let downsampled = timeBucketDownsample(regularPoints, bucket, max);

    // Always preserve first and last of full range
    const allPoints = rows.map(r => ({
      t: r.recorded_at,
      v: Number(r.value),
      hv: r.invested_value != null ? Number(r.invested_value) : null,
      cb: r.cost_basis != null ? Number(r.cost_basis) : null,
      source: r.source,
    }));
    const first = allPoints[0];
    const last = allPoints[allPoints.length - 1];

    // Merge: downsampled + trade points + endpoints
    const mergedMap = new Map<string, Point>();
    // Add first and last with endpoint priority
    mergedMap.set(first.t, first);
    mergedMap.set(last.t, last);
    // Add downsampled
    for (const p of downsampled) {
      if (!mergedMap.has(p.t)) mergedMap.set(p.t, p);
    }
    // Add trade points (override non-trade at same timestamp)
    for (const p of tradePoints) {
      mergedMap.set(p.t, p);
    }

    // Sort by timestamp (monotonic guarantee)
    let finalPoints = Array.from(mergedMap.values());
    finalPoints.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());

    // Trim if over max (keep first, last, and trades)
    if (finalPoints.length > max + tradePoints.length + 2) {
      // Just hard-trim in extreme cases
      const step = (finalPoints.length - 1) / (max - 1);
      const trimmed: Point[] = [];
      for (let i = 0; i < max; i++) {
        trimmed.push(finalPoints[Math.round(i * step)]);
      }
      finalPoints = trimmed;
    }

    return new Response(JSON.stringify({
      points: finalPoints,
      range,
      available: true,
      first_snapshot_at: rows[0].recorded_at,
      coverage_notes: coverageNotes,
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
