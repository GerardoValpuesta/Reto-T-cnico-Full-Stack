import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.routes.js';
import sessionRoutes from './routes/session.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import testRoutes from './routes/test.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// Serve frontend static files without caching
app.use(express.static(path.join(__dirname, '../public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  },
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Favicon handler
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Unprotected API Routes
app.use('/', authRoutes);
app.use('/', sessionRoutes);
app.use('/', testRoutes);

// Protected API Routes
app.use('/', bookingRoutes);

export default app;
