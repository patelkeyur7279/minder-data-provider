import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import usersRouter from './routes/users';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';

/**
 * Load environment variables
 */
dotenv.config();

/**
 * Create Express app
 */
const app = express();
const PORT = process.env.PORT || 3001;

/**
 * Security & Performance Middleware
 * 
 * Why each middleware?
 * - helmet: Sets security HTTP headers
 * - cors: Enables cross-origin requests
 * - compression: Compresses responses
 * - express.json: Parses JSON bodies
 */
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

/**
 * Rate Limiting
 * 
 * Protects API from abuse
 * - 100 requests per 15 minutes
 */
app.use(
  rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
  })
);

/**
 * Health check endpoint
 * 
 * Why needed?
 * - Load balancers use this
 * - Monitoring systems check health
 * - Quick way to verify server is up
 */
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  });
});

/**
 * API Routes
 */
app.use('/api/users', usersRouter);

/**
 * 404 Handler
 * Must be after all routes
 */
app.use(notFoundHandler);

/**
 * Error Handler
 * Must be last middleware
 */
app.use(errorHandler);

/**
 * Start server
 */
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║  Minder API Server                   ║
║                                      ║
║  Status: Running ✓                   ║
║  Port: ${PORT}                        ║
║  Environment: ${process.env.NODE_ENV || 'development'}
║                                      ║
║  Endpoints:                          ║
║  GET    /health                      ║
║  GET    /api/users                   ║
║  GET    /api/users/:id               ║
║  POST   /api/users                   ║
║  PUT    /api/users/:id               ║
║  DELETE /api/users/:id               ║
╚══════════════════════════════════════╝
  `);
});

export default app;
