import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '../generated/prisma/client.js';
import { RedisService } from '../redis/redis.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import { UserRepository } from './user.repository.js';

export const USER_CACHE_TTL_SECONDS = 300;
export const userCacheKey = (id: number) => `user:${id}`;

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly redis: RedisService,
  ) {}

  async create(dto: CreateUserDto) {
    try {
      const password = await bcrypt.hash(dto.password, 10);
      return await this.userRepository.create({
        email: dto.email,
        name: dto.name,
        password,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }
  }

  findAll() {
    return this.userRepository.findAll();
  }

  async findOne(id: number) {
    const user = await this.redis.getOrSet(
      userCacheKey(id),
      USER_CACHE_TTL_SECONDS,
      () => this.userRepository.findById(id),
    );
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }

  async update(id: number, dto: UpdateUserDto) {
    try {
      const data: Prisma.UserUpdateInput = { ...dto };
      if (dto.password) {
        data.password = await bcrypt.hash(dto.password, 10);
      }
      const updated = await this.userRepository.update(id, data);
      await this.redis.del(userCacheKey(id));
      return updated;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`User #${id} not found`);
        }
        if (this.isUniqueConstraintError(error)) {
          throw new ConflictException('Email already in use');
        }
      }
      throw error;
    }
  }

  async remove(id: number) {
    try {
      const deleted = await this.userRepository.delete(id);
      await this.redis.del(userCacheKey(id));
      return deleted;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`User #${id} not found`);
      }
      throw error;
    }
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
