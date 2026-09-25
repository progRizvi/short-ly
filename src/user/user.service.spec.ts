import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { RedisService } from '../redis/redis.service.js';
import { UserRepository } from './user.repository.js';
import { UserService } from './user.service.js';

const safeUser = (id: number) => ({
  id,
  email: `u${id}@example.com`,
  name: `User ${id}`,
  isVerified: false,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
});

describe('UserService profile cache', () => {
  let service: UserService;
  let module: TestingModule;
  const repo = {
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        UserService,
        RedisService,
        { provide: UserRepository, useValue: repo },
      ],
    }).compile();
    service = module.get(UserService);
  });

  afterAll(async () => {
    await module
      .get(RedisService)
      .del('user:999001', 'user:999002', 'user:999003');
    await module.close();
  });

  beforeEach(() => vi.clearAllMocks());

  it('caches findOne: repository hit once for two calls', async () => {
    repo.findById.mockResolvedValue(safeUser(999001));
    const first = await service.findOne(999001);
    const second = await service.findOne(999001);
    // JSON round-trip normalizes Dates to ISO strings; compare normalized.
    expect(JSON.parse(JSON.stringify(first))).toEqual(second);
    expect(repo.findById).toHaveBeenCalledTimes(1);
  });

  it('update invalidates the cache', async () => {
    repo.findById.mockResolvedValue(safeUser(999002));
    repo.update.mockResolvedValue({ ...safeUser(999002), name: 'Renamed' });
    await service.findOne(999002);
    await service.update(999002, { name: 'Renamed' });
    await service.findOne(999002);
    expect(repo.findById).toHaveBeenCalledTimes(2);
  });

  it('remove invalidates the cache', async () => {
    repo.findById.mockResolvedValue(safeUser(999003));
    repo.delete.mockResolvedValue(safeUser(999003));
    await service.findOne(999003);
    await service.remove(999003);
    repo.findById.mockResolvedValue(safeUser(999003));
    await service.findOne(999003);
    expect(repo.findById).toHaveBeenCalledTimes(2);
  });
});
