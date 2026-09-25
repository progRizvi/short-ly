import { Module } from '@nestjs/common';
import { RedirectController } from './redirect.controller.js';
import { ShortenerController } from './shortener.controller.js';
import { ShortenerRepository } from './shortener.repository.js';
import { ShortenerService } from './shortener.service.js';

@Module({
  controllers: [ShortenerController, RedirectController],
  providers: [ShortenerService, ShortenerRepository],
  exports: [ShortenerService],
})
export class ShortenerModule {}
