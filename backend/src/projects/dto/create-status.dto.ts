import { IsString, MaxLength, IsIn, Matches } from 'class-validator';

export class CreateStatusDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsString()
  @IsIn(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'])
  category: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';

  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be hex format #XXXXXX' })
  color: string;
}
