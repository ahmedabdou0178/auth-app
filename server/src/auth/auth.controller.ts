import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  type AuthResponse,
  type SignInInput,
  signInSchema,
  type SignUpInput,
  signUpSchema,
} from '@auth-app/shared';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { clientContext } from '../sessions/client-context.js';
import { Csrf, Public } from '../sessions/decorators.js';
import { SessionCookies } from '../sessions/session-cookies.js';
import { AuthResponseDto } from '../users/dto/user.dto.js';
import { toUserDto } from '../users/user.mapper.js';
import { AuthService, type SignedIn } from './auth.service.js';
import { SignInDto, SignUpDto } from './dto/auth.dto.js';

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
  @Csrf('none')
  @ApiOperation({
    summary: 'Create an account and sign in',
    description: 'Sets the `sid` session cookie and the `refresh_token` cookie (both httpOnly).',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'VALIDATION_ERROR with field details' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'EMAIL_TAKEN' })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto })
  async signUp(
    @Body(new ZodValidationPipe(signUpSchema)) body: SignUpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(
      res,
      await this.auth.signUp(body satisfies SignUpInput, clientContext(req)),
    );
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @Csrf('none')
  @ApiOperation({
    summary: 'Sign in',
    description: 'Sets the `sid` session cookie and the `refresh_token` cookie (both httpOnly).',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'VALIDATION_ERROR' })
  @ApiUnauthorizedResponse({
    type: ApiErrorDto,
    description: 'INVALID_CREDENTIALS (same for unknown email and wrong password)',
  })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto })
  async signIn(
    @Body(new ZodValidationPipe(signInSchema)) body: SignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(
      res,
      await this.auth.signIn(body satisfies SignInInput, clientContext(req)),
    );
  }

  private respond(res: Response, signedIn: SignedIn): AuthResponse {
    this.cookies.setSession(res, signedIn.session.sessionId);
    this.cookies.setRefresh(res, signedIn.refreshToken);
    return { user: toUserDto(signedIn.user), csrfToken: signedIn.session.csrfToken };
  }
}
