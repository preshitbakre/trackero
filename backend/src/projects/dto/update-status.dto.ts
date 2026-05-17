import { IsString, MaxLength, IsIn, Matches, IsOptional, IsInt } from 'class-validator';

export class UpdateStatusDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['backlog', 'in_progress', 'done'])
  category?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be hex format #XXXXXX' })
  color?: string;

  @IsOptional()
  @IsInt()
  wipLimit?: number;

  @IsOptional()
  isDefault?: boolean;
}
