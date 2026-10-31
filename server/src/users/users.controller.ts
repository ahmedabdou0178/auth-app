import { Controller, Get } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { MeResponse } from '@auth-app/shared';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import type { AuthContext } from '../sessions/auth-context.js';
import { CurrentAuth } from '../sessions/decorators.js';
import { SESSION_COOKIE_AUTH } from '../swagger.js';
import { AuthResponseDto } from './dto/user.dto.js';
import { toUserDto } from './user.mapper.js';

@ApiTags('users')
@ApiCookieAuth(SESSION_COOKIE_AUTH)
@Controller('users')
export class UsersController {
  @Get('me')
  @ApiOperation({
    summary: 'Current user (protected)',
    description:
      "Also returns the session's CSRF token so the client can recover it after a reload.",
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'No valid session (INVALID_SESSION)' })
  me(@CurrentAuth() auth: AuthContext): MeResponse {
    return { user: toUserDto(auth.user), csrfToken: auth.session.csrfToken };
  }
}
