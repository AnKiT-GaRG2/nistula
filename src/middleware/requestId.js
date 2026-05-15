import { randomUUID } from 'crypto';

export function requestId(req, res, next) {
  // Honour an upstream request ID (e.g. from a load balancer) if present
  const id = (req.headers['x-request-id'] || randomUUID()).slice(0, 64);
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
