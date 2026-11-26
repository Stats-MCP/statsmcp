import { describe, expect, it, vi } from 'vitest';

import { runTool } from '@/tools/tool-result';

describe('runTool', () => {
  it('names the error type of an unexpected error, without its message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await runTool(async () => {
      throw new DOMException('secret detail', 'TimeoutError');
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Unexpected error while reading statistics data (TimeoutError).'
      }
    ]);
  });
});
