import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toolInput } from '@/tools/tool-input';

describe('toolInput', () => {
  const schema = toolInput({ tableId: z.string().describe('Table id.') });

  it('leaves the $schema URI out of the JSON Schema', () => {
    const json = schema['~standard'].jsonSchema.input({
      target: 'draft-2020-12'
    });

    expect(json).not.toHaveProperty('$schema');
    expect(json).toMatchObject({
      type: 'object',
      properties: { tableId: { type: 'string', description: 'Table id.' } },
      required: ['tableId']
    });
  });

  it('still validates input', () => {
    expect(schema.safeParse({ tableId: 1 }).success).toBe(false);
    expect(schema.parse({ tableId: 'a' })).toEqual({ tableId: 'a' });
  });
});
