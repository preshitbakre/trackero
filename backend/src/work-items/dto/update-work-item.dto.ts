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
  startDate?: string | null;

  @IsOptional()
  @IsString()
  endDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  labelIds?: number[];
}
