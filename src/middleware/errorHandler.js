import { AppError } from '../errors/AppError.js';

export function notFound(req, res) {
  res.status(404).json({
    error: `${req.method} ${req.path} not found`,
    code: 'NOT_FOUND',
    requestId: req.requestId,
  });
}

// Express identifies a 4-arity function as an error handler — _next is required
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, _next) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      requestId: req.requestId,
    });
  }

  // Body-parser JSON syntax error
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Request body is not valid JSON',
      code: 'INVALID_JSON',
      requestId: req.requestId,
    });
  }

  // Body too large
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Request body exceeds size limit',
      code: 'PAYLOAD_TOO_LARGE',
      requestId: req.requestId,
    });
  }

  console.error(
    JSON.stringify({
      type: 'unhandled_error',
      requestId: req.requestId,
      message: error?.message,
      stack: error?.stack,
      timestamp: new Date().toISOString(),
    }),
  );

  return res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    requestId: req.requestId,
  });
}
