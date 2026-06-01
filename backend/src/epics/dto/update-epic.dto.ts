import { IsString, IsIn, IsOptional, IsDateString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateEpicDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  description?: string | null;

  // `shipped` is intentionally NOT accepted here — use the ship operation.
  @IsOptional()
  @IsIn(['draft', 'planning', 'in_flight'])
  epicState?: 'draft' | 'planning' | 'in_flight';

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  endDate?: string | null;
}
