import { z } from 'zod';

/** Tool input without the `$schema` URI: clients send it to the model on every turn, and it carries no meaning there. */
export function toolInput<T extends z.core.$ZodShape>(
  shape: T
): z.ZodObject<T> {
  const schema = z.object(shape);
  const standard = schema['~standard'];
  const { jsonSchema } = standard;
  schema['~standard'] = {
    ...standard,
    jsonSchema: {
      input: (options) => {
        const { $schema: _uri, ...rest } = jsonSchema.input(options);
        return rest;
      },
      output: (options) => {
        const { $schema: _uri, ...rest } = jsonSchema.output(options);
        return rest;
      }
    }
  };
  return schema;
}
