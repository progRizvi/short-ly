import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { MailService } from '../mail/mail.service.js';
import { RedisService } from '../redis/redis.service.js';
import { userCacheKey } from '../user/user.service.js';
import { UserRepository } from '../user/user.repository.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userRepository.findByEmail(dto.email);

    if (existing) {
      throw new ConflictException('Email already in use');
    }
    const password = await bcrypt.hash(dto.password, 10);
    const verificationToken = randomBytes(32).toString('hex');
    const user = await this.userRepository.create({
      email: dto.email,
      name: dto.name,
      password,
      verificationToken,
      verificationTokenExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    });

    const appUrl = this.configService.getOrThrow<string>('APP_URL');
    await this.mailService.sendVerificationEmail(
      user.email,
      `${appUrl}/auth/verify-email?token=${verificationToken}`,
    );
    return {
      message:
        'Registration successful. Please check your email to verify your account.',
      user,
    };
  }

  async verifyEmail(token: string) {
    if (!token) {
      throw new BadRequestException('Verification token is required');
    }
    const record = await this.userRepository.findByVerificationToken(token);
    if (
      !record ||
      !record.verificationTokenExpiresAt ||
      record.verificationTokenExpiresAt < new Date()
    ) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    const verified = await this.userRepository.update(record.id, {
      isVerified: true,
      verificationToken: null,
      verificationTokenExpiresAt: null,
    });
    await this.redis.del(userCacheKey(record.id));
    return verified;
  }

  async login(dto: LoginDto) {
    const credentials = await this.userRepository.findCredentialsByEmail(
      dto.email,
    );
    if (
      !credentials ||
      !(await bcrypt.compare(dto.password, credentials.password))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const user = await this.userRepository.findById(credentials.id);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isVerified) {
      throw new ForbiddenException(
        'Please verify your email before logging in',
      );
    }
    return { ...user, accessToken: this.signToken(user.id, user.email) };
  }

  private signToken(userId: number, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }
}
