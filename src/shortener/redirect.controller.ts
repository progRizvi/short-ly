import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ShortenerService } from './shortener.service.js';

@Controller()
export class RedirectController {
  constructor(private readonly shortener: ShortenerService) {}

  @Get(':code')
  async redirect(
    @Param('code') code: string,
    @Res() res: Response,
  ): Promise<void> {
    const target = await this.shortener.resolve(code);
    res.redirect(target);
  }
}
