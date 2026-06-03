import { IsArray, ArrayNotEmpty, IsInt, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkStatusDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Type(() => Number)
  itemIds: number[];

  @IsInt()
  @Type(() => Number)
  statusId: number;
}

export class BulkAssignDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Type(() => Number)
  itemIds: number[];

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  assigneeId?: number | null;
}

export class BulkSprintDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Type(() => Number)
  itemIds: number[];

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sprintId?: number | null;
}

export class BulkDeleteDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Type(() => Number)
  itemIds: number[];

  @IsOptional()
  @IsBoolean()
  hard?: boolean;
}
