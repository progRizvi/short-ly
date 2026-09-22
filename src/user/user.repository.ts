import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { UserModel } from '../generated/prisma/models.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const safeUserSelect = {
  id: true,
  email: true,
  name: true,
  isVerified: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{
  select: typeof safeUserSelect;
}>;

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.UserCreateInput): Promise<SafeUser> {
    return this.prisma.user.create({ data, select: safeUserSelect });
  }

  findAll(): Promise<SafeUser[]> {
    return this.prisma.user.findMany({ select: safeUserSelect });
  }

  findById(id: number): Promise<SafeUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: safeUserSelect,
    });
  }

  findByEmail(email: string): Promise<SafeUser | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: safeUserSelect,
    });
  }

  findByVerificationToken(token: string): Promise<{
    id: number;
    verificationTokenExpiresAt: Date | null;
  } | null> {
    return this.prisma.user.findUnique({
      where: { verificationToken: token },
      select: { id: true, verificationTokenExpiresAt: true },
    });
  }
  findCredentialsByEmail(
    email: string,
  ): Promise<Pick<UserModel, 'id' | 'email' | 'password'> | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, password: true },
    });
  }

  update(id: number, data: Prisma.UserUpdateInput): Promise<SafeUser> {
    return this.prisma.user.update({
      where: { id },
      data,
      select: safeUserSelect,
    });
  }

  delete(id: number): Promise<SafeUser> {
    return this.prisma.user.delete({
      where: { id },
      select: safeUserSelect,
    });
  }
}
