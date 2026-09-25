import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { CreateShortUrlDto } from './dto/create-short-url.dto.js';
import { ShortenerService } from './shortener.service.js';

interface AuthenticatedRequest {
  user: { userId: number; email: string };
}

@UseGuards(JwtAuthGuard)
@Controller('shortener')
export class ShortenerController {
  constructor(private readonly shortener: ShortenerService) {}

  @Post()
  create(
    @Body() dto: CreateShortUrlDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.shortener.create(dto, req.user.userId);
  }

  @Get()
  mine(@Request() req: AuthenticatedRequest) {
    return this.shortener.listMine(req.user.userId);
  }

  @Delete(':code')
  remove(
    @Param('code') code: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.shortener.remove(code, req.user.userId);
  }
}
