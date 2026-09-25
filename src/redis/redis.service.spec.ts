import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { RedisService } from './redis.service.js';

describe('RedisService', () => {
  let service: RedisService;
  let module: TestingModule;
  const ns = `test:${randomBytes(4).toString('hex')}`;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [RedisService],
    }).compile();
    service = module.get(RedisService);
    expect(await service.ping()).toBe(true);
  });

  afterAll(async () => {
    await service.delByPattern(`${ns}:*`);
    await module.close();
  });

  it('sets and gets a value with TTL', async () => {
    await service.set(`${ns}:user`, { id: 1 }, 60);
    expect(await service.get(`${ns}:user`)).toEqual({ id: 1 });
    expect(await service.ttl(`${ns}:user`)).toBeGreaterThan(0);
  });

  it('returns null for missing keys', async () => {
    expect(await service.get(`${ns}:missing`)).toBeNull();
    expect(await service.exists(`${ns}:missing`)).toBe(false);
  });

  it('concurrent getOrSet calls the fetcher once (singleflight)', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 100));
      return { shared: true };
    };
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        service.getOrSet(`${ns}:hot`, 60, fetcher),
      ),
    );
    expect(results.every((r) => r.shared)).toBe(true);
    expect(calls).toBe(1);
  });

  it('a second instance waits on the lock instead of refetching', async () => {
    const mod2 = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [RedisService],
    }).compile();
    const svc2 = mod2.get(RedisService);
    try {
      let fetch1 = 0;
      let fetch2 = 0;
      const slow = async () => {
        fetch1 += 1;
        await new Promise((r) => setTimeout(r, 300));
        return { v: 1 };
      };
      const [a, b] = await Promise.all([
        service.getOrSet(`${ns}:stampede`, 60, slow),
        (async () => {
          await new Promise((r) => setTimeout(r, 50));
          return svc2.getOrSet(`${ns}:stampede`, 60, async () => {
            fetch2 += 1;
            return { v: 2 };
          });
        })(),
      ]);
      expect(a).toEqual({ v: 1 });
      expect(b).toEqual({ v: 1 });
      expect(fetch1).toBe(1);
      expect(fetch2).toBe(0);
    } finally {
      await mod2.close();
    }
  });

  it('deletes keys', async () => {
    await service.set(`${ns}:temp`, 'x');
    expect(await service.del(`${ns}:temp`)).toBe(1);
    expect(await service.get(`${ns}:temp`)).toBeNull();
  });
});
