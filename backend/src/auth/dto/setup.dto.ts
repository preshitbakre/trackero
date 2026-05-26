import {
  IsEmail,
  IsString,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { IsStrongPassword } from '../../common/decorators/is-strong-password.decorator';

export class SetupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsStrongPassword()
  password: string;
}
