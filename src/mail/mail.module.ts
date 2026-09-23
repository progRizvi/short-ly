import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { MAIL_QUEUE } from './mail.constants.js';
import { MailProcessor } from './mail.processor.js';
import { MailService } from './mail.service.js';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [MailService, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
