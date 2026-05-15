export function requestLogger(req, res, next) {
  const startMs = Date.now();

  res.on('finish', () => {
    const entry = {
      type: 'http_request',
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startMs,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      timestamp: new Date().toISOString(),
    };

    if (res.statusCode >= 500) {
      console.error(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  });

  next();
}
