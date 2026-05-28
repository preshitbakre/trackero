import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpsertReleaseNoteDto {
  @IsString() @MaxLength(20000)
  body: string;

  // When true, stamp publishedAt (publish the note).
  @IsOptional() @IsBoolean()
  publish?: boolean;
}
