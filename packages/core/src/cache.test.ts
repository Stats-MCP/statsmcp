import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMemoryCache } from '@/cache';

describe('createMemoryCache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('evicts the oldest entries to stay within the size budget', async () => {
    const cache = createMemoryCache({ maxChars: 40 });

    await cache.set('a', 'x'.repeat(10), 60);
    await cache.set('b', 'x'.repeat(10), 60);
    await cache.set('c', 'x'.repeat(10), 60);
    await cache.set('d', 'x'.repeat(10), 60);
    await cache.set('e', 'x'.repeat(10), 60);

    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('e')).toBe('x'.repeat(10));
  });

  it('does not store a value larger than a quarter of the budget', async () => {
    const cache = createMemoryCache({ maxChars: 40 });

    await cache.set('small', 'x'.repeat(5), 60);
    await cache.set('large', 'x'.repeat(11), 60);

    expect(await cache.get('large')).toBeUndefined();
    expect(await cache.get('small')).toBe('x'.repeat(5));
  });

  it('frees the old size when a key is replaced', async () => {
    const cache = createMemoryCache({ maxChars: 40 });

    for (let i = 0; i < 10; i++) await cache.set('same', 'x'.repeat(10), 60);
    await cache.set('other', 'x'.repeat(10), 60);

    expect(await cache.get('same')).toBe('x'.repeat(10));
    expect(await cache.get('other')).toBe('x'.repeat(10));
  });

  it('keeps at most maxEntries entries', async () => {
    const cache = createMemoryCache({ maxEntries: 2 });

    await cache.set('a', 'a', 60);
    await cache.set('b', 'b', 60);
    await cache.set('c', 'c', 60);

    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('c')).toBe('c');
  });

  it('frees the size of an expired entry when it is read', async () => {
    vi.useFakeTimers();
    const cache = createMemoryCache({ maxChars: 40 });

    await cache.set('old', 'x'.repeat(10), 1);
    vi.advanceTimersByTime(1001);
    expect(await cache.get('old')).toBeUndefined();

    for (const key of ['a', 'b', 'c', 'd']) {
      await cache.set(key, 'x'.repeat(10), 60);
    }

    expect(await cache.get('a')).toBe('x'.repeat(10));
  });
});
