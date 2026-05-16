import { IsString, MaxLength, IsOptional, IsBoolean } from 'class-validator';

export class UpdateChecklistItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}
