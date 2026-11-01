export interface TokenBucketOptions {
  ratePerSecond: number;
  burst?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface TokenBucket {
  take(): Promise<void>;
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function createTokenBucket(options: TokenBucketOptions): TokenBucket {
  const capacity = options.burst ?? 1;
  const now = options.now ?? Date.now;
  const wait = options.sleep ?? sleep;
  let tokens = capacity;
  let last = now();
  let queue = Promise.resolve();

  function refill(): void {
    const current = now();
    tokens = Math.min(
      capacity,
      tokens + ((current - last) / 1000) * options.ratePerSecond
    );
    last = current;
  }

  async function takeOne(): Promise<void> {
    refill();
    if (tokens < 1) {
      await wait(Math.ceil(((1 - tokens) / options.ratePerSecond) * 1000));
      refill();
    }
    tokens -= 1;
  }

  return {
    take() {
      const next = queue.then(takeOne);
      queue = next.catch(() => undefined);
      return next;
    }
  };
}
