process.env.NODE_ENV = process.env.NODE_ENV || 'production';
const { execSync } = require('child_process');
const path = require('path');

console.log('[Startup] Checking database configuration...');

if (process.env.MONGODB_URI) {
  console.log('[Startup] MONGODB_URI detected:', process.env.MONGODB_URI);
} else if (process.env.DATABASE_URL) {
  console.log('[Startup] DATABASE_URL detected. Synchronizing Prisma schema with PostgreSQL...');
  try {
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
    console.log('[Startup] Database schema synchronized successfully.');
  } catch (err) {
    console.warn('[Startup] Prisma db push warning (server will continue):', err.message);
  }
} else {
  console.log('[Startup] Connecting to default local MongoDB (localhost:27017)...');
}

console.log('[Startup] Launching ERUS server...');
require(path.join(__dirname, '..', 'dist', 'server.cjs'));
