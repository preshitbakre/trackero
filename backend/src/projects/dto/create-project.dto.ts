import { IsString, MaxLength, IsOptional, Matches, IsInt } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @Matches(/^[A-Z0-9]{2,5}$/, { message: 'prefix must be 2-5 uppercase letters or digits' })
  prefix: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsInt()
  leadId?: number;
}
