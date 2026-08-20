import { ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ready only after a database round trip', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };
    const controller = new HealthController(pool as unknown as Pool);

    await expect(controller.readiness()).resolves.toEqual({ status: 'ready' });
    expect(pool.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns service unavailable when the database cannot answer', async () => {
    const pool = { query: jest.fn().mockRejectedValue(new Error('offline')) };
    const controller = new HealthController(pool as unknown as Pool);

    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
