import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserRepository } from '../user/user.repository.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }
    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.userRepository.create({
      email: dto.email,
      name: dto.name,
      password,
    });
    return { ...user, accessToken: this.signToken(user.id, user.email) };
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
    return { ...user, accessToken: this.signToken(user!.id, user!.email) };
  }

  private signToken(userId: number, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }
}
