// Main entry point for Minder Data Provider
export * from './core/MinderDataProvider.js';
export * from './core/types.js';
export * from './core/EnvironmentManager.js';
export * from './core/ProxyManager.js';
export * from './hooks/index.js';
export * from './hooks/useEnvironment.js';
export * from './models/BaseModel.js';
export * from './utils/index.js';

// Modular exports for tree-shaking
export * from './crud/index.js';
export * from './auth/index.js';
export * from './cache/index.js';
export * from './websocket/index.js';
export * from './upload/index.js';
export * from './debug/index.js';
export * from './config/index.js';
export * from './ssr/index.js';