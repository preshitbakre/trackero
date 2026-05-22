import { IsInt, IsString } from 'class-validator';

export class BoardMoveDto {
  @IsInt()
  itemId: number;

  @IsInt()
  statusId: number;

  @IsString()
  sortOrder: string;
}
