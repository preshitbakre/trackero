import { IsString } from 'class-validator';
import { IsStrongPassword } from '../../common/decorators/is-strong-password.decorator';

export class SetNewPasswordDto {
  @IsString()
  @IsStrongPassword()
  newPassword: string;
}
