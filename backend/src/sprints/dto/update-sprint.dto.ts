import { IsString, MaxLength, IsOptional } from 'class-validator';

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
}
