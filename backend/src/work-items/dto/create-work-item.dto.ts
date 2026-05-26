import {
  IsString, MaxLength, IsOptional, IsInt, IsIn, IsArray, Min,
} from 'class-validator';

export class CreateWorkItemDto {
  @IsString()
  @IsIn(['epic', 'story', 'task', 'bug', 'subtask'])
  itemType: 'epic' | 'story' | 'task' | 'bug' | 'subtask';

  @IsOptional()
  @IsInt()
  parentId?: number;

  @IsString()
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['urgent', 'high', 'medium', 'low', 'none'])
  priority?: string;

  @IsOptional()
  @IsInt()
  statusId?: number;

  @IsOptional()
  @IsInt()
  sprintId?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  storyPoints?: number;

  @IsOptional()
  @IsInt()
  assigneeId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  endDate?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  labelIds?: number[];

  @IsOptional()
  @IsInt()
  linkedItemId?: number;

  @IsOptional()
  @IsString()
  @IsIn(['belongs_to', 'relates_to', 'blocks', 'caused_by'])
  linkType?: string;
}
