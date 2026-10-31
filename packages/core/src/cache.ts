export interface Cache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface MemoryCacheOptions {
  maxEntries?: number;
  /** Total budget in UTF-16 code units (about 2 bytes each). */
  maxChars?: number;
}

const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_MAX_CHARS = 8 * 1024 * 1024;

export function createMemoryCache(options: MemoryCacheOptions = {}): Cache {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const maxValueChars = Math.floor(maxChars / 4);
  const entries = new Map<string, { value: string; expiresAt: number }>();
  let totalChars = 0;

  function remove(key: string): void {
    const entry = entries.get(key);
    if (!entry) return;
    totalChars -= entry.value.length;
    entries.delete(key);
  }

  return {
    async get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        remove(key);
        return undefined;
      }
      return entry.value;
    },
    async set(key, value, ttlSeconds) {
      remove(key);
      if (value.length > maxValueChars) return;
      while (
        entries.size > 0 &&
        (entries.size >= maxEntries || totalChars + value.length > maxChars)
      ) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        remove(oldest);
      }
      entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      totalChars += value.length;
    }
  };
}
