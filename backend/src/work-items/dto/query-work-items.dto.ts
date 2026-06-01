import { IsOptional, IsString, IsInt, IsIn, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class QueryWorkItemsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  @IsOptional()
  @IsString()
  itemType?: string; // comma-separated: 'epic,story,task,subtask'

  @IsOptional()
  @IsString()
  parentId?: string; // number or 'null' for root items

  @IsOptional()
  @IsString()
  status?: string; // comma-separated status IDs

  @IsOptional()
  @IsString()
  priority?: string; // comma-separated priorities

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assigneeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sprintId?: number;

  // When true (and no explicit sprintId), filters to items that have ANY sprint
  // assigned — i.e. excludes backlog (sprintId IS NULL).
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasSprint?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  labelId?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'updatedAt', 'priority', 'endDate', 'sortOrder'])
  sort?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC';
}
