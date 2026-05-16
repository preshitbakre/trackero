import { IsString, MaxLength, Matches } from 'class-validator';

export class CreateLabelDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be hex format #XXXXXX' })
  color: string;
}
