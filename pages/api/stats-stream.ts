// /pages/api/stats-stream.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import statsStore from './lib/statsStore';

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Правильный формат SSE
  const sendStats = async () => {
    try {
      const { totalRequests, requestsPerSecond } = await statsStore.getStats();
      
      // Правильный формат SSE: data: {...}\n\n
      res.write(`data: ${JSON.stringify({
        total: totalRequests,
        rps: requestsPerSecond,
        timestamp: Date.now()
      })}\n\n`);
    } catch (error) {
      console.error('SSE error:', error);
    }
  };

  // Запускаем поток
  const interval = setInterval(sendStats, 500); // Обновляем каждые 500мс

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
}