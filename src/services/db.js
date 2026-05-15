import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

let _pool = null;

export function getPool() {
  if (!config.databaseUrl) return null;
  if (!_pool) {
    _pool = new Pool({ connectionString: config.databaseUrl });
    _pool.on('error', (err) => {
      console.error(
        JSON.stringify({ type: 'db_pool_error', message: err.message, timestamp: new Date().toISOString() }),
      );
    });
  }
  return _pool;
}

export async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
