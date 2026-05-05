export function errorHandler(err, req, res, next) {
  console.error('[Error]', err);

  if (err.name === 'ZodError') {
    return res.status(400).json({
      message: 'Ошибка валидации',
      errors: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Внутренняя ошибка сервера';

  res.status(status).json({ message });
}
