import { ApiProperty } from '@nestjs/swagger';
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type SignInInput,
  type SignUpInput,
} from '@auth-app/shared';

// Documentation only: validation is done by the shared zod schemas (ZodValidationPipe).

export class SignUpDto implements SignUpInput {
  @ApiProperty({
    example: 'ada@example.com',
    format: 'email',
    maxLength: EMAIL_MAX_LENGTH,
    description: 'Trimmed and lowercased',
  })
  email!: string;

  @ApiProperty({
    example: 'Ada Lovelace',
    minLength: NAME_MIN_LENGTH,
    maxLength: NAME_MAX_LENGTH,
    description: 'Trimmed',
  })
  name!: string;

  @ApiProperty({
    example: 'Secr3t!pass',
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description: 'At least one letter, one number and one special character',
  })
  password!: string;
}

export class SignInDto implements SignInInput {
  @ApiProperty({ example: 'ada@example.com', format: 'email', maxLength: EMAIL_MAX_LENGTH })
  email!: string;

  @ApiProperty({ example: 'Secr3t!pass', format: 'password', minLength: 1 })
  password!: string;
}
