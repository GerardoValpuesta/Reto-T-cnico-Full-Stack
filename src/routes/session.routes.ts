import { Router } from 'express';
import { listSessions } from '../controllers/session.controller.js';

const router = Router();

router.get('/sessions', listSessions);

export default router;
