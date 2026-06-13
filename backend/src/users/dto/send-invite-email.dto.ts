import { IsString, MaxLength } from 'class-validator';

export class SendInviteEmailDto {
  @IsString()
  @MaxLength(255)
  token: string;
}
