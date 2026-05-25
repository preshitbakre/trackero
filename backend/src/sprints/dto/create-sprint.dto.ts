import { IsString, MaxLength, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateSprintDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  goal: string;

  @IsString()
  @MaxLength(32)
  startDate: string;

  @IsString()
  @MaxLength(32)
  endDate: string;
}
