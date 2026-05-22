import {
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
  IsInt,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReorderItemEntryDto {
  @IsInt()
  itemId: number;

  @IsString()
  @MaxLength(255)
  sortOrder: string;
}

export class ReorderItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemEntryDto)
  reorders: ReorderItemEntryDto[];
}
