import {
  IsEmail,
  IsOptional,
  IsString,
  Validate,
  ValidateIf,
} from 'class-validator';
import { EmailOrUsernameConstraint } from '../validators/email-or-username.validator';

export class SendFriendRequestDto {
  @IsOptional()
  @IsString()
  recipient?: string;

  @IsOptional()
  @IsEmail({}, { message: 'A valid email address is required' })
  @Validate(EmailOrUsernameConstraint)
  email?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @ValidateIf((dto: SendFriendRequestDto) => {
    const totalProvided =
      (dto.recipient ? 1 : 0) + (dto.email ? 1 : 0) + (dto.username ? 1 : 0);
    if (totalProvided === 0) {
      dto.email = '';
      dto.username = '';
    }
    return true;
  })
  @IsOptional()
  @IsString()
  _?: string;
}
