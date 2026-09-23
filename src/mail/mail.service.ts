import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Queue } from 'bullmq';
import nodemailer, { type Transporter } from 'nodemailer';
import { MAIL_QUEUE } from './mail.constants.js';

export interface VerificationEmailJob {
  to: string;
  verificationUrl: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(
    @InjectQueue(MAIL_QUEUE)
    private readonly mailQueue: Queue<VerificationEmailJob>,
    configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: configService.getOrThrow<string>('SMTP_HOST'),
      port: Number(configService.get<string>('SMTP_PORT') ?? 587),
      secure: configService.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: configService.getOrThrow<string>('SMTP_USER'),
        pass: configService.getOrThrow<string>('SMTP_PASS'),
      },
    });
    this.from =
      configService.get<string>('SMTP_FROM') ?? 'short-ly <no-reply@short.ly>';
  }

  async sendVerificationEmail(to: string, verificationUrl: string) {
    const job: VerificationEmailJob = { to, verificationUrl };
    try {
      await this.mailQueue.add('send-verification', job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
    } catch (error) {
      this.logger.warn('Mail queue unavailable, sending directly');
      await this.sendMailNow(to, verificationUrl);
    }
  }

  async sendMailNow(to: string, verificationUrl: string) {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Verify your short-ly email',
        text: `Welcome to short-ly! Verify your email by opening this link (valid 24h): ${verificationUrl}`,
        html: `<p>Welcome to short-ly!</p><p><a href="${verificationUrl}">Verify your email</a> (valid 24h).</p>`,
      });
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        this.logger.log(`Verification email preview: ${previewUrl}`);
      }
    } catch (error) {
      this.logger.warn(
        `Could not send verification email to ${to}. Verification URL: ${verificationUrl}`,
      );
      throw error;
    }
  }
}
