import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job } from 'bullmq';
import { MAIL_QUEUE } from './mail.constants.js';
import { MailService, type VerificationEmailJob } from './mail.service.js';

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<VerificationEmailJob>) {
    if (job.name === 'send-verification') {
      this.logger.log(`Processing job ${job.id} to ${job.data.to}`);
      try {
        await this.mailService.sendMailNow(
          job.data.to,
          job.data.verificationUrl,
        );
        this.logger.log(`Completed job ${job.id} to ${job.data.to}`);
      } catch (error) {
        this.logger.error(
          `Failed job ${job.id} to ${job.data.to}: ${(error as Error).message}`,
        );
        throw error;
      }
    }
  }
}
