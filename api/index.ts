import type { Request, Response } from 'express';
// @ts-ignore
import serverBundle from '../dist/server.cjs';

const app = serverBundle.app || serverBundle.default || serverBundle;
const ensureMongoReady = serverBundle.ensureMongoReady;

export default async function handler(req: Request, res: Response) {
  if (typeof ensureMongoReady === 'function') {
    try {
      await ensureMongoReady();
    } catch (err: any) {
      console.warn('[Vercel Serverless] Mongo ready warning:', err?.message);
    }
  }
  return app(req, res);
}
