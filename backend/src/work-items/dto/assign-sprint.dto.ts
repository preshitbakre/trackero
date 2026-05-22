import { IsOptional, IsInt } from 'class-validator';

export class AssignSprintDto {
  @IsOptional()
  @IsInt()
  sprintId?: number | null;
}
