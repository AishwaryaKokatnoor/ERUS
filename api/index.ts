import type { Request, Response } from 'express';
import app, { ensureMongoReady } from '../server.ts';

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
