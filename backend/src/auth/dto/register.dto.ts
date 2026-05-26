import { IsEmail, IsString, MaxLength, IsOptional } from 'class-validator';
import { IsStrongPassword } from '../../common/decorators/is-strong-password.decorator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsStrongPassword()
  password: string;

  @IsString()
  @MaxLength(255)
  displayName: string;

  @IsOptional()
  @IsString()
  inviteToken?: string;
}
