import { IsString, IsIn, IsOptional, IsDateString, MaxLength, MinLength } from 'class-validator';

const KINDS = ['note', 'risk', 'target', 'shipped', 'kickoff'] as const;

export class CreateMilestoneDto {
  @IsIn(KINDS)
  kind: (typeof KINDS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  @IsDateString()
  occurredOn: string;
}

export class UpdateMilestoneDto {
  @IsOptional()
  @IsIn(KINDS)
  kind?: (typeof KINDS)[number];

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsDateString()
  occurredOn?: string;
}
