import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import {
  createBooking,
  deleteBooking,
  getUserBookings,
  ConflictError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../services/booking.service.js';

export async function handleCreateBooking(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { session_id } = req.body;
    if (!session_id || isNaN(parseInt(session_id, 10))) {
      return res.status(400).json({ error: 'session_id is required and must be a number' });
    }

    const idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string | undefined;

    const result = await createBooking({
      userId,
      sessionId: parseInt(session_id, 10),
      idempotencyKey,
    });

    return res.status(result.status).json(result.body);
  } catch (error: any) {
    if (error instanceof ConflictError) {
      return res.status(409).json({ error: error.message });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error creating booking:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function handleDeleteBooking(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const bookingId = parseInt(req.params.id, 10);
    if (isNaN(bookingId)) {
      return res.status(400).json({ error: 'Invalid booking ID' });
    }

    const result = await deleteBooking(bookingId, userId);
    return res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ error: error.message });
    }
    if (error instanceof ValidationError) {
      return res.status(422).json({ error: error.message });
    }
    console.error('Error deleting booking:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function handleMyBookings(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const bookings = await getUserBookings(userId);
    return res.status(200).json({ data: bookings });
  } catch (error: any) {
    console.error('Error fetching user bookings:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
