import { describe, expect, it } from 'vitest';

import { createTokenBucket } from '@/token-bucket';

function fakeClock() {
  let time = 0;
  const waits: number[] = [];
  return {
    waits,
    now: () => time,
    sleep: async (ms: number) => {
      waits.push(ms);
      time += ms;
    }
  };
}

describe('createTokenBucket', () => {
  it('spends the burst at once, then spaces requests by the rate', async () => {
    const clock = fakeClock();
    const bucket = createTokenBucket({ ratePerSecond: 2, burst: 2, ...clock });

    await Promise.all([1, 2, 3, 4].map(() => bucket.take()));

    expect(clock.waits).toEqual([500, 500]);
  });

  it('refills while the caller is busy', async () => {
    const clock = fakeClock();
    const bucket = createTokenBucket({ ratePerSecond: 1, ...clock });

    await bucket.take();
    await clock.sleep(1000);
    await bucket.take();

    expect(clock.waits).toEqual([1000]);
  });
});
