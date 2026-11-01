/** Periods per year for the frequencies whose period codes can be listed. */
const PERIODS_PER_YEAR: Readonly<Record<string, number>> = {
  A: 1,
  S: 2,
  Q: 4,
  M: 12
};

const FREQUENCY_ORDER = ['A', 'S', 'Q', 'M'];

const PERIOD_PATTERNS: readonly { freq: string; pattern: RegExp }[] = [
  { freq: 'A', pattern: /^(\d{4})$/ },
  { freq: 'S', pattern: /^(\d{4})-S([12])$/ },
  { freq: 'Q', pattern: /^(\d{4})-Q([1-4])$/ },
  { freq: 'M', pattern: /^(\d{4})-(0[1-9]|1[0-2])$/ }
];

function periodCode(freq: string, year: number, index: number): string {
  if (freq === 'A') return String(year);
  if (freq === 'M') return `${year}-${String(index + 1).padStart(2, '0')}`;
  return `${year}-${freq}${index + 1}`;
}

/**
 * SDMX time ranges look like "1948-07-01T00:00:00" with no time zone; they are
 * read as UTC so the period does not move with the server's zone.
 */
export function parseSdmxDate(text: string): Date | undefined {
  const withZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(text)
    ? text
    : `${text}Z`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Every period code of one frequency that overlaps the range, oldest first.
 * Frequencies without a fixed calendar (daily, weekly …) give no codes.
 */
export function periodCodes(freq: string, start: Date, end: Date): string[] {
  const perYear = PERIODS_PER_YEAR[freq];
  if (perYear === undefined || start > end) return [];
  const monthsPerPeriod = 12 / perYear;
  const first =
    start.getUTCFullYear() * perYear +
    Math.floor(start.getUTCMonth() / monthsPerPeriod);
  const last =
    end.getUTCFullYear() * perYear +
    Math.floor(end.getUTCMonth() / monthsPerPeriod);
  const codes: string[] = [];
  for (let step = first; step <= last; step++) {
    codes.push(periodCode(freq, Math.floor(step / perYear), step % perYear));
  }
  return codes;
}

function parsePeriod(
  code: string
): { start: number; rank: number } | undefined {
  for (const { freq, pattern } of PERIOD_PATTERNS) {
    const match = pattern.exec(code);
    if (!match) continue;
    const perYear = PERIODS_PER_YEAR[freq] ?? 1;
    const index = Number(match[2] ?? 1) - 1;
    return {
      start: Date.UTC(Number(match[1]), index * (12 / perYear)),
      rank: FREQUENCY_ORDER.indexOf(freq)
    };
  }
  return undefined;
}

/** First day (UTC) of a period code such as "2025", "2025-S1", "2025-Q3" or "2025-09". */
export function periodStart(code: string): Date | undefined {
  const period = parsePeriod(code);
  return period ? new Date(period.start) : undefined;
}

/** Sorts by start date, then year before half-year, quarter and month; unknown codes last. */
export function comparePeriods(a: string, b: string): number {
  const left = parsePeriod(a);
  const right = parsePeriod(b);
  if (!left || !right) {
    if (left) return -1;
    if (right) return 1;
    return a.localeCompare(b);
  }
  return left.start - right.start || left.rank - right.rank;
}
