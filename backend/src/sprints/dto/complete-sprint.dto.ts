import { IsOptional, IsObject } from 'class-validator';

export class CompleteSprintDto {
  @IsOptional()
  @IsObject()
  itemActions?: Record<number, 'roll' | 'backlog'>;
}
