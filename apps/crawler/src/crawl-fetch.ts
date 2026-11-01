import { sleep, type TokenBucket } from '@/token-bucket';

export type CrawlFetch = typeof fetch;

export interface CrawlFetchOptions {
  bucket: TokenBucket;
  userAgent: string;
  fetch?: CrawlFetch;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxRetryAfterMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_RETRY_AFTER_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 60_000;

function retryAfterMs(value: string | null, now: number): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

export function createCrawlFetch(options: CrawlFetchOptions): CrawlFetch {
  const doFetch = options.fetch ?? fetch;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxRetryAfterMs = options.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS;
  const wait = options.sleep ?? sleep;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (input, init) => {
    for (let attempt = 1; ; attempt++) {
      await options.bucket.take();
      const headers = new Headers(init?.headers);
      headers.set('user-agent', options.userAgent);
      const last = attempt >= maxAttempts;
      let response: Response;
      try {
        const timeout = AbortSignal.timeout(timeoutMs);
        const signal = init?.signal
          ? AbortSignal.any([timeout, init.signal])
          : timeout;
        response = await doFetch(input, { ...init, headers, signal });
      } catch (err) {
        if (last || init?.signal?.aborted) throw err;
        await wait(baseDelayMs * 2 ** (attempt - 1));
        continue;
      }
      if (last || !shouldRetry(response.status)) return response;
      await response.body?.cancel();
      const asked = retryAfterMs(response.headers.get('retry-after'), now());
      if (asked !== undefined && asked > maxRetryAfterMs) {
        throw new Error(
          `${input instanceof Request ? input.url : String(input)} asks to retry after ${Math.round(asked / 1000)} s; stopping.`
        );
      }
      await wait(asked ?? baseDelayMs * 2 ** (attempt - 1));
    }
  };
}
