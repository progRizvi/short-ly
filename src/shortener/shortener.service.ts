import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { RedisService } from '../redis/redis.service.js';
import type { CreateShortUrlDto } from './dto/create-short-url.dto.js';
import {
  ShortenerRepository,
  type ShortUrlRecord,
} from './shortener.repository.js';

export const SHORT_URL_CACHE_TTL_SECONDS = 3600;
export const shortUrlCacheKey = (code: string) => `short:${code}`;

const CODE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CODE_LENGTH = 7;
const MAX_GENERATE_ATTEMPTS = 5;

@Injectable()
export class ShortenerService {
  private readonly logger = new Logger(ShortenerService.name);
  private readonly appUrl: string;

  constructor(
    private readonly repo: ShortenerRepository,
    private readonly redis: RedisService,
    configService: ConfigService,
  ) {
    this.appUrl = configService.getOrThrow<string>('APP_URL');
  }

  async create(dto: CreateShortUrlDto, userId: number) {
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    if (dto.customCode) {
      try {
        const record = await this.repo.create({
          code: dto.customCode,
          originalUrl: dto.originalUrl,
          user: { connect: { id: userId } },
          expiresAt,
        });
        return this.withShortUrl(record);
      } catch (error) {
        if (this.isUniqueConstraintError(error)) {
          throw new ConflictException('Custom code already in use');
        }
        throw error;
      }
    }

    for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt += 1) {
      const code = this.generateCode();
      try {
        const record = await this.repo.create({
          code,
          originalUrl: dto.originalUrl,
          user: { connect: { id: userId } },
          expiresAt,
        });
        return this.withShortUrl(record);
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error;
      }
    }
    throw new ConflictException(
      'Could not generate a unique code, please try again',
    );
  }

  async resolve(code: string): Promise<string> {
    const record = await this.redis.getOrSet<ShortUrlRecord | null>(
      shortUrlCacheKey(code),
      SHORT_URL_CACHE_TTL_SECONDS,
      () => this.repo.findByCode(code),
    );
    if (!record) {
      throw new NotFoundException('Short link not found');
    }
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
      throw new GoneException('Short link has expired');
    }
    void this.repo
      .incrementClicks(record.id)
      .catch((error: Error) =>
        this.logger.warn(`Click count failed for ${code}: ${error.message}`),
      );
    return record.originalUrl;
  }

  async listMine(userId: number) {
    const records = await this.repo.listByUser(userId);
    return records.map((record) => this.withShortUrl(record));
  }

  async remove(code: string, userId: number) {
    const record = await this.repo.findByCode(code);
    if (!record || record.userId !== userId) {
      throw new NotFoundException('Short link not found');
    }
    await this.repo.deleteByCode(code);
    await this.redis.del(shortUrlCacheKey(code));
    return { message: `Short link ${code} deleted` };
  }

  private async withShortUrl(record: ShortUrlRecord) {
    await this.redis.set(
      shortUrlCacheKey(record.code),
      record,
      SHORT_URL_CACHE_TTL_SECONDS,
    );
    return { ...record, shortUrl: `${this.appUrl}/${record.code}` };
  }

  private generateCode(): string {
    return Array.from(randomBytes(CODE_LENGTH))
      .map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length])
      .join('');
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
