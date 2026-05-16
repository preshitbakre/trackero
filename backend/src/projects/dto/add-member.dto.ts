import { IsInt, IsString, IsIn } from 'class-validator';

export class AddMemberDto {
  @IsInt()
  userId: number;

  @IsString()
  @IsIn(['project_manager', 'member', 'viewer'])
  role: 'project_manager' | 'member' | 'viewer';
}
