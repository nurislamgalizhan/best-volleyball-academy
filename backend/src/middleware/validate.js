/**
 * Middleware factory to validate request body against a Zod schema
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ message: 'Ошибка валидации', errors });
    }
    req[source] = result.data;
    next();
  };
}
