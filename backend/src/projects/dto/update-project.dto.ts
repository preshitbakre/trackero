import { IsString, MaxLength, IsOptional, IsInt, IsIn } from 'class-validator';

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
  defaultAssigneeId?: number;

  @IsOptional()
  @IsInt()
  defaultSprintDuration?: number;

  @IsOptional()
  @IsString()
  @IsIn(['free', 'fibonacci', 'tshirt'])
  estimationScale?: 'free' | 'fibonacci' | 'tshirt';
}
