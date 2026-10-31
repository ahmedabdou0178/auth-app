import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  type AuthResponse,
  REQUESTED_WITH_VALUE,
  type SignInInput,
  signInSchema,
  type SignUpInput,
  signUpSchema,
} from '@auth-app/shared';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { AppException } from '../common/exceptions/app.exception.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AuthRateLimit } from '../common/throttling/throttler.options.js';
import { clientContext } from '../sessions/client-context.js';
import { Csrf, Public } from '../sessions/decorators.js';
import {
  readTokenCookie,
  REFRESH_COOKIE,
  SESSION_COOKIE,
  SessionCookies,
} from '../sessions/session-cookies.js';
import { REFRESH_COOKIE_AUTH, SESSION_COOKIE_AUTH } from '../swagger.js';
import { AuthResponseDto } from '../users/dto/user.dto.js';
import { toUserDto } from '../users/user.mapper.js';
import { AuthService } from './auth.service.js';
import { SignInDto, SignUpDto } from './dto/auth.dto.js';

const SETS_COOKIES =
  'Sets the `sid` session cookie and the `refresh_token` cookie (both httpOnly).';

const REQUESTED_WITH_DOC = {
  name: 'X-Requested-With',
  enum: [REQUESTED_WITH_VALUE],
  required: true,
  description: 'Required together with a matching Origin header (CSRF check without a session).',
} as const;

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: SessionCookies,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @AuthRateLimit()
  @Csrf('none')
  @ApiOperation({ summary: 'Create an account and sign in', description: SETS_COOKIES })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'VALIDATION_ERROR with field details' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'EMAIL_TAKEN' })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto, description: 'TOO_MANY_REQUESTS' })
  async signUp(
    @Body(new ZodValidationPipe(signUpSchema)) body: SignUpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { user, session, refreshToken } = await this.auth.signUp(
      body satisfies SignUpInput,
      clientContext(req),
    );
    this.cookies.setSession(res, session.sessionId);
    this.cookies.setRefresh(res, refreshToken);
    return { user: toUserDto(user), csrfToken: session.csrfToken };
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimit()
  @Csrf('none')
  @ApiOperation({ summary: 'Sign in', description: SETS_COOKIES })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'VALIDATION_ERROR' })
  @ApiUnauthorizedResponse({
    type: ApiErrorDto,
    description: 'INVALID_CREDENTIALS (same for unknown email and wrong password)',
  })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'TOO_MANY_REQUESTS (per IP) or ACCOUNT_LOCKED (per email, with Retry-After)',
  })
  async signIn(
    @Body(new ZodValidationPipe(signInSchema)) body: SignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { user, session, refreshToken } = await this.auth.signIn(
      body satisfies SignInInput,
      clientContext(req),
    );
    this.cookies.setSession(res, session.sessionId);
    this.cookies.setRefresh(res, refreshToken);
    return { user: toUserDto(user), csrfToken: session.csrfToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Csrf('origin')
  @ApiCookieAuth(REFRESH_COOKIE_AUTH)
  @ApiHeader(REQUESTED_WITH_DOC)
  @ApiOperation({
    summary: 'Start a new session from the refresh token',
    description:
      'Sets a new `sid` cookie (new session ID and CSRF token). The refresh token is not ' +
      'rotated. On failure both cookies are cleared.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'INVALID_REFRESH_TOKEN' })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'INVALID_CSRF_TOKEN' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    try {
      const { user, session } = await this.auth.refresh(
        readTokenCookie(req, REFRESH_COOKIE),
        readTokenCookie(req, SESSION_COOKIE),
        clientContext(req),
      );
      this.cookies.setSession(res, session.sessionId);
      return { user: toUserDto(user), csrfToken: session.csrfToken };
    } catch (error) {
      if (error instanceof AppException) this.cookies.clear(res);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(SESSION_COOKIE_AUTH)
  @ApiCookieAuth(REFRESH_COOKIE_AUTH)
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: false,
    description: 'Required while the session is valid; otherwise Origin + X-Requested-With.',
  })
  @ApiOperation({
    summary: 'Sign out',
    description:
      'Revokes the refresh token, deletes every session it created and clears both cookies. ' +
      'Idempotent: 204 even without cookies.',
  })
  @ApiNoContentResponse({ description: 'Signed out' })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'INVALID_CSRF_TOKEN' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const refreshToken = readTokenCookie(req, REFRESH_COOKIE);
    const sessionId = readTokenCookie(req, SESSION_COOKIE);
    await this.auth.logout({
      ...(refreshToken ? { refreshToken } : {}),
      ...(sessionId ? { sessionId } : {}),
    });
    this.cookies.clear(res);
  }
}
