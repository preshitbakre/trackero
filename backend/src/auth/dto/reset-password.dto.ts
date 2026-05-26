import { IsString, MaxLength } from 'class-validator';
import { IsStrongPassword } from '../../common/decorators/is-strong-password.decorator';

export class ResetPasswordDto {
  @IsString()
  @MaxLength(255)
  token: string;

  @IsString()
  @IsStrongPassword()
  newPassword: string;
}
