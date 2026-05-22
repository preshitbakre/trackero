import { IsOptional, IsInt } from 'class-validator';

export class MoveWorkItemDto {
  @IsOptional()
  @IsInt()
  parentId?: number | null;
}
