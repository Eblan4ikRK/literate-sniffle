// pages/api/lib/statsStore.ts
import Redis from 'ioredis';
import redisConfig from '../../../redis.json';

interface RedisConfig {
  url: string;
  name: string;
  useTLS?: boolean;
}

let currentRedis: Redis | null = null;
let currentConfig: RedisConfig | null = null;

// Функция для подключения к Redis (с failover)
async function connectToRedis(): Promise<Redis | null> {
  // Пробуем каждый Redis по порядку
  for (const config of redisConfig as RedisConfig[]) {
    try {
      console.log(`🔧 Попытка подключиться к Redis: ${config.name} (${config.url.split('@').pop()})`);

      const redis = new Redis(config.url, {
        ...(config.useTLS ? { tls: {} } : {}),
        retryStrategy: (times) => {
          // Не пытаемся бесконечно — только при старте
          if (times > 3) return null;
          return Math.min(times * 100, 1000);
        },
        maxRetriesPerRequest: 1,
      });

      await Promise.race([
        redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]);

      console.log(`✅ Подключено к Redis: ${config.name}`);
      currentConfig = config;
      return redis;
    } catch (error) {
      console.warn(`❌ Не удалось подключиться к Redis ${config.name}:`, (error as Error).message);
      continue;
    }
  }

  console.error('🚨 Все Redis-серверы недоступны. Работаем в оффлайн-режиме.');
  return null;
}

// Инициализация подключения
async function initRedis() {
  if (currentRedis) return;

  currentRedis = await connectToRedis();

  // При ошибке одного — попробуем переключиться позже
  if (currentRedis) {
    currentRedis.on('error', async (err) => {
      console.error('🔥 Критическая ошибка Redis:', err);
      currentRedis?.disconnect();
      currentRedis = null;
      currentConfig = null;

      // Через 5 сек попробуем переподключиться
      setTimeout(async () => {
        const newRedis = await connectToRedis();
        if (newRedis) {
          currentRedis = newRedis;
          console.log('🔁 Переключились на новый Redis-инстанс');
        }
      }, 5000);
    });
  }
}

// Вызываем при старте
initRedis().catch(console.error);

// Интерфейс хранилища
export interface StatsStore {
  logRequest(): Promise<void>;
  getStats(): Promise<{
    totalRequests: number;
    requestsPerSecond: number;
  }>;
}

class FailoverStatsStore implements StatsStore {
  private readonly KEY = 'live:requests';
  private readonly WINDOW_SIZE = 1000;

  async logRequest(): Promise<void> {
    if (!currentRedis) {
      console.debug('⚠️ Redis недоступен, logRequest проигнорирован');
      return;
    }

    const now = Date.now();
    const member = `${now}-${Math.random()}`;

    try {
      await currentRedis.zadd(this.KEY, now, member);
      await currentRedis.expire(this.KEY, 10);
    } catch (error) {
      console.error('❌ Ошибка при логировании запроса:', (error as Error).message);
      // Не падаем — пусть retry или failover сработает позже
    }
  }

  async getStats(): Promise<{
    totalRequests: number;
    requestsPerSecond: number;
  }> {
    if (!currentRedis) {
      console.debug('⚠️ Redis недоступен, возвращаем 0');
      return { totalRequests: 0, requestsPerSecond: 0 };
    }

    try {
      const now = Date.now();
      const cutoff = now - this.WINDOW_SIZE;
      await currentRedis.zremrangebyscore(this.KEY, 0, cutoff);
      const count = (await currentRedis.zcard(this.KEY)) || 0;

      return {
        totalRequests: count,
        requestsPerSecond: count,
      };
    } catch (error) {
      console.error('❌ Ошибка при получении статистики:', (error as Error).message);
      return { totalRequests: 0, requestsPerSecond: 0 };
    }
  }
}

const statsStore: StatsStore = new FailoverStatsStore();
export default statsStore;