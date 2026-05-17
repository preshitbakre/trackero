import { IsString, MaxLength, IsOptional } from 'class-validator';

export class CreateTaskTypeDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  icon?: string;
}
