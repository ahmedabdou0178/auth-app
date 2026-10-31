import { ApiProperty } from '@nestjs/swagger';
import type { AuthResponse, UserDto } from '@auth-app/shared';

export class UserResponseDto implements UserDto {
  @ApiProperty({ example: '6650f1c2e4b0a1b2c3d4e5f6' })
  id!: string;

  @ApiProperty({ example: 'ada@example.com', format: 'email' })
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  name!: string;

  @ApiProperty({ example: '2026-10-31T12:00:00.000Z', format: 'date-time' })
  createdAt!: string;
}

export class AuthResponseDto implements AuthResponse {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  @ApiProperty({
    description: 'Synchronizer token for this session: send it as X-CSRF-Token on unsafe requests',
    example: 'q3Jd9mXxS1vP7nE2yR0wT4uZ8bK6cA5hL1oN3fG7iQe',
  })
  csrfToken!: string;
}
