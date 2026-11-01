import { z } from 'zod';

/** One table in a source's catalogue, as the index and the snapshots store it. */
export const tableDocSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  /** Subject folders from the top, for example ["Economy", "Prices"]. */
  path: z.array(z.string()).readonly().optional(),
  /** ISO date of the last data update. */
  updated: z.string().optional(),
  /** Last period with data, for example "2026M09", "2026-Q3" or "2025". */
  lastPeriod: z.string().optional(),
  discontinued: z.boolean().optional()
});

export type TableDoc = z.infer<typeof tableDocSchema>;
