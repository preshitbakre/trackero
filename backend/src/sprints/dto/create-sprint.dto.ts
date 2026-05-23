import { IsString, MaxLength, IsOptional } from 'class-validator';

export class CreateSprintDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  goal?: string;

  @IsString()
  @MaxLength(32)
  startDate: string;

  @IsString()
  @MaxLength(32)
  endDate: string;
}
