import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SelectQueryBuilder, ObjectLiteral } from 'typeorm';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  limit?: number = 20;

  static apply<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    page: number,
    limit: number,
  ): void {
    if (limit === -1) return;
    qb.skip((page - 1) * limit).take(limit);
  }
}
