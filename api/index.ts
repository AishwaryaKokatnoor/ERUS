import type { Request, Response } from 'express';
import app, { ensureMongoReady } from '../server';

export default async function handler(req: Request, res: Response) {
  try {
    await ensureMongoReady();
  } catch (err: any) {
    console.warn('[Vercel Serverless] MongoDB init error:', err?.message);
  }
  return app(req, res);
}
