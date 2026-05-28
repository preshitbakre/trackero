import {
  IsString, MaxLength, IsOptional, IsInt, IsIn, IsArray, Min,
} from 'class-validator';

export class UpdateWorkItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  description?: string;

  // Editorial user-story sentence (light markdown). Edited in the Settings tab.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  userStory?: string;

  @IsOptional()
  @IsString()
  @IsIn(['urgent', 'high', 'medium', 'low', 'none'])
  priority?: string;

  @IsOptional()
  @IsInt()
  statusId?: number;

  @IsOptional()
  @IsInt()
  sprintId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  storyPoints?: number | null;

  @IsOptional()
  @IsInt()
  assigneeId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  startDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  endDate?: string | null;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  labelIds?: number[];

  @IsOptional()
  @IsInt()
  reviewerId?: number | null;
}
