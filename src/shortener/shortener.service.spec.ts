import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client.js';
import { RedisService } from '../redis/redis.service.js';
import { ShortenerRepository } from './shortener.repository.js';
import { ShortenerService } from './shortener.service.js';

const record = (overrides = {}) => ({
  id: 1,
  code: 'abc1234',
  originalUrl: 'https://example.com/very/long/url',
  userId: 7,
  clicks: 0,
  expiresAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('ShortenerService', () => {
  let service: ShortenerService;
  let module: TestingModule;
  const repo = {
    create: vi.fn(),
    findByCode: vi.fn(),
    listByUser: vi.fn(),
    incrementClicks: vi.fn(),
    deleteByCode: vi.fn(),
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        ShortenerService,
        RedisService,
        { provide: ShortenerRepository, useValue: repo },
      ],
    }).compile();
    service = module.get(ShortenerService);
  });

  afterAll(async () => {
    await module.get(RedisService).delByPattern('short:*');
    await module.close();
  });

  beforeEach(() => vi.clearAllMocks());

  it('creates a link with generated code and shortUrl', async () => {
    repo.create.mockResolvedValue(record());
    const result = await service.create(
      { originalUrl: 'https://example.com/very/long/url' },
      7,
    );
    expect(result.code).toMatch(/^[A-Za-z0-9]{7}$/);
    expect(result.shortUrl).toBe(`http://localhost:3000/${result.code}`);
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a taken custom code with 409', async () => {
    repo.create.mockRejectedValue(uniqueViolation());
    await expect(
      service.create(
        { originalUrl: 'https://example.com/x', customCode: 'taken' },
        7,
      ),
    ).rejects.toThrow('Custom code already in use');
  });

  it('retries on random code collision', async () => {
    repo.create
      .mockRejectedValueOnce(uniqueViolation())
      .mockResolvedValueOnce(record({ code: 'fresh01' }));
    const result = await service.create(
      { originalUrl: 'https://example.com/y' },
      7,
    );
    expect(result.code).toBe('fresh01');
    expect(repo.create).toHaveBeenCalledTimes(2);
  });

  it('resolves a cached link and counts the click', async () => {
    repo.create.mockResolvedValue(record({ code: 'cached01' }));
    repo.findByCode.mockResolvedValue(record({ code: 'cached01' }));
    repo.incrementClicks.mockResolvedValue(record({ code: 'cached01' }));
    await service.create(
      { originalUrl: 'https://example.com/very/long/url', customCode: 'cached01' },
      7,
    );
    const target = await service.resolve('cached01');
    expect(target).toBe('https://example.com/very/long/url');
    expect(repo.findByCode).not.toHaveBeenCalled();
    expect(repo.incrementClicks).toHaveBeenCalledTimes(1);
  });

  it('404s unknown codes and 410s expired ones', async () => {
    repo.findByCode.mockResolvedValue(null);
    await expect(service.resolve('nope000')).rejects.toThrow(
      'Short link not found',
    );
    repo.findByCode.mockResolvedValue(
      record({ code: 'old0001', expiresAt: new Date('2020-01-01') }),
    );
    await expect(service.resolve('old0001')).rejects.toThrow(
      'Short link has expired',
    );
  });

  it('refuses to delete another user\'s link', async () => {
    repo.findByCode.mockResolvedValue(record({ code: 'mine000', userId: 7 }));
    await expect(service.remove('mine000', 8)).rejects.toThrow(
      'Short link not found',
    );
    expect(repo.deleteByCode).not.toHaveBeenCalled();
  });

  it('deletes an owned link and clears the cache', async () => {
    repo.findByCode.mockResolvedValue(record({ code: 'gone000', userId: 7 }));
    repo.deleteByCode.mockResolvedValue(record({ code: 'gone000' }));
    await service.remove('gone000', 7);
    expect(repo.deleteByCode).toHaveBeenCalledWith('gone000');
  });
});
