const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying build artifacts...');

const distPath = path.join(__dirname, '../dist');
const indexPath = path.join(distPath, 'index.js');

// 1. Check if dist exists
if (!fs.existsSync(distPath)) {
    console.error('❌ Build failed: dist directory not found!');
    process.exit(1);
}

if (!fs.existsSync(indexPath)) {
    console.error('❌ Build failed: dist/index.js not found!');
    process.exit(1);
}

try {
    // 2. Try to require the built library
    const Minder = require(indexPath);

    // 3. Check for critical exports
    const requiredExports = [
        'MinderDataProvider',
        'useMinder',
        'configureMinder',
        'AuthManager'
    ];

    const missingExports = requiredExports.filter(exp => !Minder[exp]);

    if (missingExports.length > 0) {
        console.error(`❌ Build verification failed: Missing exports: ${missingExports.join(', ')}`);
        process.exit(1);
    }

    console.log('🔄 Testing runtime initialization...');

    try {
        const config = Minder.configureMinder({
            apiUrl: 'https://api.example.com',
            routes: { users: '/users' }
        });

        if (!config.apiBaseUrl || !config.routes.users) {
            throw new Error('Configuration result is invalid');
        }

        console.log('✅ Runtime initialization successful');

        // 5. Smoke Test: AuthManager
        console.log('🔄 Testing AuthManager...');
        const authManager = new Minder.AuthManager({ tokenKey: 'test-token', storage: 'memory' });
        if (!authManager) throw new Error('AuthManager failed to instantiate');
        console.log('✅ AuthManager instantiated');

        // 6. Smoke Test: ProxyManager
        console.log('🔄 Testing ProxyManager...');
        const proxyManager = new Minder.ProxyManager({
            enabled: true,
            baseUrl: 'https://proxy.example.com',
            cors: { origin: 'http://localhost:3000' }
        });
        if (!proxyManager.isEnabled()) throw new Error('ProxyManager failed to enable');
        const proxyCode = proxyManager.generateNextJSProxy();
        if (!proxyCode.includes('Access-Control-Allow-Origin')) throw new Error('ProxyManager failed to generate CORS headers');
        console.log('✅ ProxyManager verified');

    } catch (error) {
        console.error('❌ Build verification failed: Runtime error during initialization');
        console.error(error);
        process.exit(1);
    }

    console.log('✅ Build verification passed! Artifacts are safe to publish.');
    process.exit(0);

} catch (error) {
    console.error('❌ Build verification failed: Could not import library');
    console.error(error);
    process.exit(1);
}
