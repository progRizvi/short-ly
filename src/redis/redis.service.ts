import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

export interface GetOrSetOptions {
  lockTtlMs?: number;
  waitTimeoutMs?: number;
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RELEASE_LOCK_LUA = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(configService: ConfigService) {
    this.client = new Redis({
      host: configService.get<string>('REDIS_HOST') ?? 'localhost',
      port: Number(configService.get<string>('REDIS_PORT') ?? 6379),
      password: configService.get<string>('REDIS_PASSWORD') || undefined,
      keyPrefix: 'short-ly:',
      maxRetriesPerRequest: 3,
    });
    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }

  async ping(): Promise<boolean> {
    return (await this.client.ping()) === 'PONG';
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, raw, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, raw);
    }
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>,
    opts: GetOrSetOptions = {},
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    // Singleflight: dedupe concurrent callers in this process.
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;

    const task = this.getOrSetWithLock(key, ttlSeconds, fetcher, opts).finally(
      () => {
        if (this.inflight.get(key) === task) this.inflight.delete(key);
      },
    );
    this.inflight.set(key, task);
    return task;
  }

  private async getOrSetWithLock<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>,
    {
      lockTtlMs = 10_000,
      waitTimeoutMs = 5_000,
      retryDelayMs = 50,
    }: GetOrSetOptions,
  ): Promise<T> {
    const lockKey = `${key}:lock`;
    const token = randomUUID();
    const acquired = await this.client.set(
      lockKey,
      token,
      'PX',
      lockTtlMs,
      'NX',
    );

    if (acquired === 'OK') {
      try {
        const fresh = await fetcher();
        if (fresh !== null && fresh !== undefined) {
          await this.set(key, fresh, ttlSeconds);
        }
        return fresh;
      } finally {
        await this.client.eval(RELEASE_LOCK_LUA, 1, lockKey, token);
      }
    }

    // Lost the race: poll until the winner fills the cache.
    const deadline = Date.now() + waitTimeoutMs;
    while (Date.now() < deadline) {
      await sleep(retryDelayMs);
      const cached = await this.get<T>(key);
      if (cached !== null) return cached;
    }

    // Winner died without filling the cache: fetch anyway, don't fail.
    this.logger.warn(`Lock wait timed out for ${key}, fetching directly`);
    const fresh = await fetcher();
    if (fresh !== null && fresh !== undefined) {
      await this.set(key, fresh, ttlSeconds);
    }
    return fresh;
  }

  async delByPattern(pattern: string): Promise<number> {
    let deleted = 0;
    let cursor = '0';
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern);
      cursor = next;
      if (keys.length > 0) deleted += await this.del(...keys);
    } while (cursor !== '0');
    return deleted;
  }
}
