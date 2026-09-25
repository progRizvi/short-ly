import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type ShortUrlRecord = Prisma.ShortUrlGetPayload<Record<string, never>>;

@Injectable()
export class ShortenerRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ShortUrlCreateInput): Promise<ShortUrlRecord> {
    return this.prisma.shortUrl.create({ data });
  }

  findByCode(code: string): Promise<ShortUrlRecord | null> {
    return this.prisma.shortUrl.findUnique({ where: { code } });
  }

  listByUser(userId: number): Promise<ShortUrlRecord[]> {
    return this.prisma.shortUrl.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  incrementClicks(id: number): Promise<ShortUrlRecord> {
    return this.prisma.shortUrl.update({
      where: { id },
      data: { clicks: { increment: 1 } },
    });
  }

  deleteByCode(code: string): Promise<ShortUrlRecord> {
    return this.prisma.shortUrl.delete({ where: { code } });
  }
}
