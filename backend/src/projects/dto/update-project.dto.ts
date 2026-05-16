import { IsString, MaxLength, IsOptional, IsInt } from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  leadId?: number;

  @IsOptional()
  @IsInt()
  defaultSprintDuration?: number;
}
