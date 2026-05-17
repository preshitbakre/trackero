import { IsString, MaxLength, Matches, IsOptional } from 'class-validator';

export class UpdateLabelDto {
  @IsOptional()
  @IsString()
  @MaxLength(15)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be hex format #XXXXXX' })
  color?: string;
}
