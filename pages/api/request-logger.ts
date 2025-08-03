// /pages/api/request-logger.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import statsStore from './lib/statsStore';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await statsStore.logRequest();
  res.status(200).json({ ok: true });
}