import { IsString, MaxLength, IsOptional, IsInt, IsIn } from 'class-validator';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['task', 'bug', 'story'])
  type?: string;

  @IsOptional()
  @IsString()
  @IsIn(['urgent', 'high', 'medium', 'low', 'none'])
  priority?: string;

  @IsOptional()
  @IsInt()
  storyPoints?: number;

  @IsOptional()
  @IsInt()
  assigneeId?: number;

  @IsOptional()
  @IsInt()
  epicId?: number;

  @IsOptional()
  @IsInt()
  sprintId?: number;

  @IsOptional()
  @IsString()
  dueDate?: string;
}
