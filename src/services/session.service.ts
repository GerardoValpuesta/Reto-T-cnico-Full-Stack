import { pool } from '../db/index.js';

export interface SessionFilterQuery {
  from?: string;
  to?: string;
  instructor?: string;
  only_available?: boolean;
  cursor?: string;
  limit?: number;
}

export interface SessionDto {
  id: number;
  title: string;
  instructor: string;
  starts_at: string;
  duration_minutes: number;
  capacity: number;
  booked_seats: number;
  available_seats: number;
}

export interface CursorPayload {
  starts_at: string;
  id: number;
}

export function encodeCursor(starts_at: string, id: number): string {
  const str = `${starts_at}_${id}`;
  return Buffer.from(str).toString('base64');
}

export function decodeCursor(cursorStr: string): CursorPayload | null {
  try {
    const decoded = Buffer.from(cursorStr, 'base64').toString('utf8');
    const parts = decoded.split('_');
    if (parts.length < 2) return null;
    const id = parseInt(parts.pop()!, 10);
    const starts_at = parts.join('_');
    if (isNaN(id) || !starts_at) return null;
    return { starts_at, id };
  } catch {
    return null;
  }
}

export async function getSessions(filters: SessionFilterQuery) {
  const limit = Math.min(Math.max(filters.limit || 20, 1), 100);
  const fetchLimit = limit + 1; // Fetch 1 extra to determine has_more

  const params: any[] = [];
  const conditions: string[] = ['1=1'];

  if (filters.from) {
    params.push(filters.from);
    conditions.push(`s.starts_at >= $${params.length}`);
  }

  if (filters.to) {
    params.push(filters.to);
    conditions.push(`s.starts_at <= $${params.length}`);
  }

  if (filters.instructor) {
    params.push(filters.instructor);
    conditions.push(`s.instructor = $${params.length}`);
  }

  if (filters.only_available) {
    conditions.push(`(s.capacity - (SELECT COUNT(*)::int FROM bookings b WHERE b.session_id = s.id)) > 0`);
  }

  if (filters.cursor) {
    const parsedCursor = decodeCursor(filters.cursor);
    if (parsedCursor) {
      params.push(parsedCursor.starts_at);
      const startsAtParamIndex = params.length;
      params.push(parsedCursor.id);
      const idParamIndex = params.length;

      conditions.push(
        `(s.starts_at < $${startsAtParamIndex} OR (s.starts_at = $${startsAtParamIndex} AND s.id < $${idParamIndex}))`
      );
    }
  }

  params.push(fetchLimit);
  const limitParamIndex = params.length;

  const sql = `
    SELECT 
      s.id,
      s.title,
      s.instructor,
      s.starts_at,
      s.duration_minutes,
      s.capacity,
      (SELECT COUNT(*)::int FROM bookings b WHERE b.session_id = s.id) AS booked_seats,
      (s.capacity - (SELECT COUNT(*)::int FROM bookings b WHERE b.session_id = s.id)) AS available_seats
    FROM sessions s
    WHERE ${conditions.join(' AND ')}
    ORDER BY s.starts_at DESC, s.id DESC
    LIMIT $${limitParamIndex};
  `;

  const result = await pool.query(sql, params);
  const rows = result.rows;

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore && data.length > 0) {
    const lastItem = data[data.length - 1];
    const startsAtIso = new Date(lastItem.starts_at).toISOString();
    nextCursor = encodeCursor(startsAtIso, lastItem.id);
  }

  return {
    data: data.map((r) => ({
      id: r.id,
      title: r.title,
      instructor: r.instructor,
      starts_at: new Date(r.starts_at).toISOString(),
      duration_minutes: r.duration_minutes,
      capacity: r.capacity,
      booked_seats: r.booked_seats,
      available_seats: r.available_seats,
    })),
    pagination: {
      next_cursor: nextCursor,
      has_more: hasMore,
      limit,
    },
  };
}
