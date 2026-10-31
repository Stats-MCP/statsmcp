import type { TableSearchHit } from '@/pxweb-client';

const CLOSED_RANGE =
  /(\d{4})(?:[MQH]\d{1,2})?\s*-\s*(\d{4})(?:[MQH]\d{1,2})?\s*$/;
const CLOSED_SERIES = /closed series|avslutta serie|avsluttet serie/i;
const HISTORICAL_PENALTY = 1;
const RECENCY_WEIGHT = 0.15;
const RECENCY_YEARS = 4;
const POSITION_COST = 0.03;

export function isHistorical(title: string, currentYear: number): boolean {
  if (CLOSED_SERIES.test(title)) return true;
  const match = CLOSED_RANGE.exec(title);
  return match !== null && Number(match[2]) < currentYear - 1;
}

function recency(published: string | undefined, currentYear: number): number {
  const year = Number(published?.slice(0, 4));
  if (!Number.isFinite(year)) return 0;
  const age = currentYear - year;
  return Math.max(0, Math.min(1, (RECENCY_YEARS - age) / RECENCY_YEARS));
}

/** The API's relevance order stays the base score; age and closed ranges adjust it. */
export function rankSearchHits(
  hits: readonly TableSearchHit[],
  currentYear: number
): TableSearchHit[] {
  return hits
    .map((hit, index) => {
      let score = -index * POSITION_COST;
      if (hit.archived || isHistorical(hit.title, currentYear)) {
        score -= HISTORICAL_PENALTY;
      }
      score += RECENCY_WEIGHT * recency(hit.published, currentYear);
      return { hit, score, index };
    })
    .toSorted((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.hit);
}
