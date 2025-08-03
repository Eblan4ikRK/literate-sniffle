// pages/api/lib/statsStore.ts
import Redis from 'ioredis';
import redisConfig from '../../../redis.json';

interface RedisConfig {
  url: string;
  name: string;
  useTLS?: boolean;
}

let client: Redis | null = null;
let config: RedisConfig | null = null;
let currentIndex = -1;

// Функция: подключиться к следующему доступному Redis
async function connect(): Promise<boolean> {
  // Начинаем с 0 или после текущего
  const startFrom = currentIndex === -1 ? 0 : (currentIndex + 1) % redisConfig.length;
  const tried: number[] = [];

  let index = startFrom;

  do {
    const conf = (redisConfig as RedisConfig[])[index];
    if (!conf) {
      tried.push(index);
      continue;
    }

    console.log(`🔁 Попытка подключиться к Redis: ${conf.name}`);

    try {
      const redis = new Redis(conf.url, {
        ...(conf.useTLS ? { tls: {} } : {}),
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          return times > 3 ? null : 100;
        },
      });

      // Проверим подключение
      await Promise.race([redis.ping(), new Promise((_, reject) => setTimeout(reject, 3000))]);

      // Успешно
      if (client) client.quit(); // Закрываем старое подключение
      client = redis;
      config = conf;
      currentIndex = index;

      console.log(`✅ Подключено к Redis: ${conf.name}`);
      return true;
    } catch (err) {
      console.warn(`❌ Не удалось подключиться к Redis ${conf.name}:`, (err as Error).message);
    }

    tried.push(index);
    index = (index + 1) % redisConfig.length;
  } while (index !== startFrom);

  console.error('🚨 Все Redis-серверы недоступны.');
  client = null;
  config = null;
  currentIndex = -1;
  return false;
}

// Инициализация
async function init() {
  if (!(await connect())) {
    // Даже если не подключились — попробуем позже
    setInterval(async () => {
      if (!client) {
        console.log('🔄 Попытка восстановить подключение к Redis...');
        await connect();
      }
    }, 5000);
  }
}

// Запускаем при старте
init().catch(console.error);

// Обработка ошибок активного клиента
function setupClientEvents() {
  if (!client || !config) return;

  client.on('error', async (err) => {
    console.error(`🔥 Ошибка Redis (${config.name}):`, err.message);
    client?.removeAllListeners();
    client = null;

    // Попробуем переключиться на другой узел
    await connect();
  });

  client.on('close', () => {
    console.log(`🔌 Соединение с Redis ${config?.name} закрыто`);
    client = null;
    setTimeout(() => connect(), 2000);
  });
}

// Первое подключение + подписка на события
connect().then(setupClientEvents);

// Переподписываем события при каждом новом подключении
const originalConnect = connect;
connect = new Proxy(originalConnect, {
  async apply(target, thisArg, args) {
    const result = await Reflect.apply(target, thisArg, args);
    if (result) setupClientEvents();
    return result;
  },
});

// === Интерфейс StatsStore ===
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
    if (!client) {
      console.debug('⚠️ Redis недоступен. Запрос не залогирован.');
      return;
    }

    const now = Date.now();
    const member = `${now}-${Math.random()}`;

    try {
      await client.zadd(this.KEY, now, member);
      await client.expire(this.KEY, 10);
    } catch (err) {
      console.error('❌ Ошибка при logRequest:', (err as Error).message);
      // Клиент сам упадёт → сработает переподключение
    }
  }

  async getStats(): Promise<{
    totalRequests: number;
    requestsPerSecond: number;
  }> {
    if (!client) {
      return { totalRequests: 0, requestsPerSecond: 0 };
    }

    try {
      const now = Date.now();
      const cutoff = now - this.WINDOW_SIZE;
      await client.zremrangebyscore(this.KEY, 0, cutoff);
      const count = (await client.zcard(this.KEY)) || 0;

      return {
        totalRequests: count,
        requestsPerSecond: count,
      };
    } catch (err) {
      console.error('❌ Ошибка при getStats:', (err as Error).message);
      return { totalRequests: 0, requestsPerSecond: 0 };
    }
  }
}

const statsStore = new FailoverStatsStore();
export default statsStore;
