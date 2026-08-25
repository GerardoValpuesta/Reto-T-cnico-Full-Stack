import { describe, it, expect } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';

const request = supertest(app);

describe('GET /sessions Endpoint', () => {
  it('should list sessions with calculated available_seats in < 200 ms', async () => {
    const start = Date.now();
    const res = await request.get('/sessions?limit=20');
    const latency = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.length).toBeLessThanOrEqual(20);
    expect(latency).toBeLessThan(200); // Must answer in under 200ms!

    const sample = res.body.data[0];
    expect(sample.available_seats).toBeDefined();
    expect(typeof sample.available_seats).toBe('number');
    expect(res.body.pagination.next_cursor).toBeDefined();
  });

  it('should support cursor pagination correctly', async () => {
    const page1 = await request.get('/sessions?limit=5');
    expect(page1.body.data.length).toBe(5);
    const cursor = page1.body.pagination.next_cursor;
    expect(cursor).toBeTruthy();

    const page2 = await request.get(`/sessions?limit=5&cursor=${cursor}`);
    expect(page2.body.data.length).toBe(5);

    // Verify IDs are distinct
    const page1Ids = page1.body.data.map((s: any) => s.id);
    const page2Ids = page2.body.data.map((s: any) => s.id);
    const overlap = page1Ids.filter((id: number) => page2Ids.includes(id));
    expect(overlap.length).toBe(0);
  });
});
