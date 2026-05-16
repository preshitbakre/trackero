import { IsString, IsIn } from 'class-validator';

export class ChangeRoleDto {
  @IsString()
  @IsIn(['admin', 'project_manager', 'member', 'viewer'])
  role: 'admin' | 'project_manager' | 'member' | 'viewer';
}
