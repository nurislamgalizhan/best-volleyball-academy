import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { initSocket } from './socket/index.js';
import { prisma } from './db.js';
import { errorHandler } from './middleware/errorHandler.js';
import { clearExpiredVisitsForUsers } from './utils/subscription.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import tariffRoutes from './routes/tariffs.js';
import visitRoutes from './routes/visits.js';
import saleRoutes from './routes/sales.js';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

initSocket(io);

app.disable('x-powered-by');

async function cleanupExpiredSubscriptionVisits() {
  try {
    const result = await clearExpiredVisitsForUsers(prisma);
    if (result.count > 0) {
      console.log(`[Subscriptions] Cleared expired visit balances for ${result.count} user(s)`);
    }
  } catch (err) {
    console.error('[Subscriptions] Failed to clear expired visit balances:', err.message);
  }
}

cleanupExpiredSubscriptionVisits();
const cleanupInterval = setInterval(cleanupExpiredSubscriptionVisits, 60 * 60 * 1000);
cleanupInterval.unref?.();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '16kb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tariffs', tariffRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/sales', saleRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
});
