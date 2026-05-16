import { IsInt } from 'class-validator';

export class ChangeStatusDto {
  @IsInt()
  statusId: number;
}
