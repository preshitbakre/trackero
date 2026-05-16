import { IsInt, IsString } from 'class-validator';

export class BoardMoveDto {
  @IsInt()
  taskId: number;

  @IsInt()
  statusId: number;

  @IsString()
  sortOrder: string;
}
