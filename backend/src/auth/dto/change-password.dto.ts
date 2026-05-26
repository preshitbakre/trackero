import { IsString, MaxLength } from 'class-validator';
import { IsStrongPassword } from '../../common/decorators/is-strong-password.decorator';

export class ChangePasswordDto {
  @IsString()
  @MaxLength(72)
  currentPassword: string;

  @IsString()
  @IsStrongPassword()
  newPassword: string;
}
