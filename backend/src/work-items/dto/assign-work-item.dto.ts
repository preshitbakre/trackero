import { IsOptional, IsInt } from 'class-validator';

export class AssignWorkItemDto {
  @IsOptional()
  @IsInt()
  assigneeId?: number | null;
}
