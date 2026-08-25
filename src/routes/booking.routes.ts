import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth.middleware.js';
import {
  handleCreateBooking,
  handleDeleteBooking,
  handleMyBookings,
} from '../controllers/booking.controller.js';

const router = Router();

router.use(authenticateJWT);

router.post('/bookings', handleCreateBooking);
router.delete('/bookings/:id', handleDeleteBooking);
router.get('/my-bookings', handleMyBookings);

export default router;
