export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    body: string,
  ) {
    super(`HTTP ${status} for ${url}: ${body.slice(0, 200)}`);
  }
}

const lastCall = new Map<string, number>();

/**
 * Minimal spacing between requests to the same host. Steam's market endpoints
 * in particular rate-limit hard (~20 req/min per IP).
 */
async function throttle(host: string, minGapMs: number) {
  const prev = lastCall.get(host) ?? 0;
  const wait = prev + minGapMs - Date.now();
  lastCall.set(host, Math.max(Date.now(), prev + minGapMs));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type FetchOpts = { headers?: Record<string, string>; minGapMs?: number; retries?: number };

async function request(url: string, opts: FetchOpts, accept: string): Promise<Response> {
  const { headers, minGapMs = 0, retries = 2 } = opts;
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    await throttle(host, minGapMs);
    const res = await fetch(url, { headers: { Accept: accept, ...headers } });
    if (res.ok) return res;
    const body = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) throw new HttpError(res.status, url, body);
    await sleep(res.status === 429 ? 30_000 * (attempt + 1) : 2_000 * (attempt + 1));
  }
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  return (await (await request(url, opts, "application/json")).json()) as T;
}
