import { IsString, MaxLength, IsOptional, IsIn, IsInt, Min, ValidateIf } from 'class-validator';

export class UpdateSprintDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  goal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  endDate?: string;

  @IsOptional()
  @IsIn(['roll', 'backlog', 'ask'])
  carryOverPolicy?: 'roll' | 'backlog' | 'ask';

  // `null` is a meaningful value here — clears the override and reverts to auto.
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;
}
