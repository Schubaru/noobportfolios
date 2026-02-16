/**
 * Shared Alpaca Market Data helper.
 * Base URL: https://data.alpaca.markets
 * Auth: APCA-API-KEY-ID + APCA-API-SECRET-KEY headers
 */

const ALPACA_BASE = 'https://data.alpaca.markets';
const MAX_RETRIES = 3;
const INITIAL_RETRY_MS = 500;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface AlpacaConfig {
  keyId: string;
  secretKey: string;
}

/**
 * Returns Alpaca credentials from env, or null if not configured.
 */
export function getAlpacaConfig(): AlpacaConfig | null {
  const keyId = Deno.env.get('ALPACA_API_KEY_ID');
  const secretKey = Deno.env.get('ALPACA_API_SECRET_KEY');
  if (!keyId || !secretKey) return null;
  return { keyId, secretKey };
}

/**
 * Standard 500 response when keys are missing.
 */
export function missingKeysResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: 'Alpaca keys not configured' }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

/**
 * Fetch from Alpaca data API with retry + exponential backoff.
 * @param path  e.g. "/v2/stocks/AAPL/snapshot"
 * @param cfg   AlpacaConfig with keyId and secretKey
 * @param params  optional URLSearchParams entries
 */
export async function alpacaFetch(
  path: string,
  cfg: AlpacaConfig,
  params?: Record<string, string>,
): Promise<Response> {
  const url = new URL(path, ALPACA_BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: {
          'APCA-API-KEY-ID': cfg.keyId,
          'APCA-API-SECRET-KEY': cfg.secretKey,
        },
      });

      if ((res.status === 429 || (res.status >= 500 && res.status < 600)) && attempt < MAX_RETRIES - 1) {
        const wait = INITIAL_RETRY_MS * Math.pow(2, attempt);
        console.log(`Alpaca ${res.status}, retry in ${wait}ms (${attempt + 1}/${MAX_RETRIES})`);
        await delay(wait);
        continue;
      }

      return res;
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) throw err;
      const wait = INITIAL_RETRY_MS * Math.pow(2, attempt);
      console.log(`Alpaca network error, retry in ${wait}ms:`, err);
      await delay(wait);
    }
  }

  throw new Error('Alpaca: max retries exceeded');
}
