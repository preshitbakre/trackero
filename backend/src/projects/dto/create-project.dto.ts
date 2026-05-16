import { IsString, MaxLength, IsOptional, Matches, IsInt } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @Matches(/^[A-Z]{2,10}$/, { message: 'prefix must be 2-10 uppercase letters' })
  prefix: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  leadId?: number;
}
