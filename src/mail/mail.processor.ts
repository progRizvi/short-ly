import { Processor, WorkerHost } from '@nestjs/bullmq';
import { type Job } from 'bullmq';
import { MAIL_QUEUE } from './mail.constants.js';
import { MailService, type VerificationEmailJob } from './mail.service.js';

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<VerificationEmailJob>) {
    if (job.name === 'send-verification') {
      await this.mailService.sendMailNow(
        job.data.to,
        job.data.verificationUrl,
      );
    }
  }
}
