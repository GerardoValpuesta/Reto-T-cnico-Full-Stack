import { Request, Response } from 'express';
import { getSessions, SessionFilterQuery } from '../services/session.service.js';

export async function listSessions(req: Request, res: Response) {
  try {
    const { from, to, instructor, only_available, cursor, limit } = req.query;

    const filters: SessionFilterQuery = {
      from: from ? String(from) : undefined,
      to: to ? String(to) : undefined,
      instructor: instructor ? String(instructor) : undefined,
      only_available: only_available === 'true',
      cursor: cursor ? String(cursor) : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
    };

    const result = await getSessions(filters);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error listing sessions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
