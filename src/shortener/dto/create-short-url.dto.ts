import {
  IsInt,
  IsOptional,
  IsUrl,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateShortUrlDto {
  @IsUrl({ require_protocol: true })
  originalUrl!: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{3,32}$/, {
    message:
      'customCode must be 3-32 characters of letters, numbers, "-" or "_"',
  })
  customCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}
