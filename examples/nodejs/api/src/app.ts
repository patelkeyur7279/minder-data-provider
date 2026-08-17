import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import usersRouter from './routes/users';
import webhookRouter from './routes/webhook';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';

/**
 * Load environment variables
 */
dotenv.config();

/**
 * Build the Express app.
 *
 * Split out from index.ts (which only boots the HTTP listener) so tests can
 * import and exercise the app directly via supertest without binding a port.
 */
export function createApp() {
  const app = express();

  /**
   * Security & Performance Middleware
   *
   * Why each middleware?
   * - helmet: Sets security HTTP headers
   * - cors: Enables cross-origin requests
   * - compression: Compresses responses
   */
  app.use(helmet());
  app.use(cors());
  app.use(compression());

  /**
   * Webhook route — mounted BEFORE express.json().
   *
   * createWebhookHandler (minder-data-provider/server) verifies an HMAC
   * signature over the RAW request body. express.json() would consume and
   * re-parse the body stream first, leaving nothing for the webhook route's
   * toNodeHandler listener to read. See src/routes/webhook.ts.
   */
  app.use('/api/webhook', webhookRouter);

  /**
   * express.json: Parses JSON bodies for every route mounted after this.
   */
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
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
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

  return app;
}

export default createApp;
