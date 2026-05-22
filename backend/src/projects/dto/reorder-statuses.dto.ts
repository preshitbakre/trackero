import { IsArray, ArrayNotEmpty, IsInt } from 'class-validator';

export class ReorderStatusesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  statusIds: number[];
}
