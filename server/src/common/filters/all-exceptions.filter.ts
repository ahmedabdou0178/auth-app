import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type ApiError, ErrorCode } from '@auth-app/shared';
import { AppException } from '../exceptions/app.exception.js';

interface BodyParserError {
  type: string;
  status: number;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as Partial<BodyParserError>).type === 'string' &&
    typeof (error as Partial<BodyParserError>).status === 'number'
  );
}

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

function codeFor(status: number): ErrorCode {
  return (
    CODE_BY_STATUS[status] ?? (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST)
  );
}

function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  const { message } = response as { message?: unknown };
  return typeof message === 'string' ? message : exception.message;
}

type ErrorBody = Omit<ApiError, 'requestId'>;

/**
 * Turns every error into the `ApiError` shape. Unknown errors become a generic 500 and are
 * logged with their stack server-side only; nothing internal (stack, Mongo error) is returned.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const body = this.toBody(exception);
    const requestId = typeof request.id === 'string' ? request.id : 'unknown';

    if (body.statusCode === 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    } else if (body.statusCode > 500) {
      this.logger.warn(`${body.statusCode} ${body.message}`);
    }

    if (response.headersSent) return;
    response.status(body.statusCode).json({ ...body, requestId } satisfies ApiError);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof AppException) {
      const status = exception.getStatus();
      return {
        statusCode: status,
        error: STATUS_CODES[status] ?? 'Error',
        message: exception.message,
        code: exception.code,
        ...(exception.details ? { details: exception.details } : {}),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        statusCode: status,
        error: STATUS_CODES[status] ?? 'Error',
        // 5xx (e.g. a failed health check) report only their status text.
        message: status >= 500 ? (STATUS_CODES[status] ?? 'Error') : messageOf(exception),
        code: codeFor(status),
      };
    }

    if (isBodyParserError(exception) && exception.status < 500) {
      const tooLarge = exception.type === 'entity.too.large';
      const status = tooLarge ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST;
      return {
        statusCode: status,
        error: STATUS_CODES[status] ?? 'Error',
        message: tooLarge ? 'Request body is too large' : 'Malformed request body',
        code: codeFor(status),
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Something went wrong',
      code: ErrorCode.INTERNAL_ERROR,
    };
  }
}
