import createApp from './app';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const app = createApp();

/**
 * Start server — only when this file is run directly (`node dist/index.js`,
 * `tsx src/index.ts`), never when imported (e.g. by tests importing
 * `createApp` from ./app, or any other module importing this one). Guards
 * against double-binding the port and lets the app be tested without a live
 * listener.
 */
if (require.main === module) {
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
║  POST   /api/webhook                 ║
╚══════════════════════════════════════╝
    `);
  });
}

export default app;
