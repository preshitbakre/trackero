import { IsString, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MaxLength(10000)
  body: string;
}
