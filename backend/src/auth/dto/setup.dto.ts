import { Type } from 'class-transformer';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsArray,
  IsIn,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';

export class SetupAdminDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(14)
  @MaxLength(72)
  password: string;
}

export class SetupInstanceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;
}

export class SetupInviteDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsIn(['admin', 'project_manager', 'member', 'viewer'])
  role: 'admin' | 'project_manager' | 'member' | 'viewer';
}

export class SetupDto {
  @ValidateNested()
  @Type(() => SetupAdminDto)
  admin: SetupAdminDto;

  @ValidateNested()
  @Type(() => SetupInstanceDto)
  instance: SetupInstanceDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetupInviteDto)
  invites?: SetupInviteDto[];
}
