import { IsString, MaxLength, IsOptional, IsIn, Matches } from 'class-validator';

export class UpdateEpicDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['open', 'in_progress', 'done'])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['urgent', 'high', 'medium', 'low', 'none'])
  priority?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  targetDate?: string;
}
