import {
  type ArgumentsHost,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type ApiError, ErrorCode } from '@auth-app/shared';
import { AppException } from '../exceptions/app.exception';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface Captured {
  status?: number;
  body?: ApiError;
  headers: Record<string, string>;
}

function respond(exception: unknown): Captured {
  const captured: Captured = { headers: {} };
  const res = {
    headersSent: false,
    set(headers: Record<string, string>) {
      Object.assign(captured.headers, headers);
      return res;
    },
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: ApiError) {
      captured.body = body;
      return res;
    },
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => ({ id: 'req-1' }), getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return captured;
}

describe('AllExceptionsFilter', () => {
  it('turns an unknown error into a generic 500 without leaking internals', () => {
    const error = new Error('E11000 duplicate key error collection: auth.users index: email_1');
    const { status, body } = respond(error);

    expect(status).toBe(500);
    expect(body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong',
      code: ErrorCode.INTERNAL_ERROR,
      requestId: 'req-1',
    });
    expect(JSON.stringify(body)).not.toMatch(/E11000|auth\.users|at /);
  });

  it('reports other 5xx with their status text only (e.g. a failed health check)', () => {
    const { status, body } = respond(
      new ServiceUnavailableException({ status: 'error', error: { mongodb: { status: 'down' } } }),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({
      message: 'Service Unavailable',
      code: ErrorCode.SERVICE_UNAVAILABLE,
    });
    expect(JSON.stringify(body)).not.toContain('mongodb');
  });

  it('keeps the code, details and headers of an AppException', () => {
    const { status, body, headers } = respond(
      new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.ACCOUNT_LOCKED,
        'Too many failed sign-in attempts, try again later',
        undefined,
        { 'Retry-After': '42' },
      ),
    );
    expect(status).toBe(429);
    expect(body).toMatchObject({ code: ErrorCode.ACCOUNT_LOCKED, error: 'Too Many Requests' });
    expect(headers).toEqual({ 'Retry-After': '42' });
  });

  it('includes validation details', () => {
    const details = [{ field: 'email', message: 'Enter a valid email address' }];
    const { body } = respond(
      new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        details,
      ),
    );
    expect(body?.details).toEqual(details);
  });

  it('maps Nest HTTP exceptions to error codes', () => {
    const { status, body } = respond(new NotFoundException('Cannot GET /api/nope'));
    expect(status).toBe(404);
    expect(body).toMatchObject({ code: ErrorCode.NOT_FOUND, message: 'Cannot GET /api/nope' });
  });

  it.each([
    ['entity.too.large', 413, 413, ErrorCode.PAYLOAD_TOO_LARGE],
    ['entity.parse.failed', 400, 400, ErrorCode.BAD_REQUEST],
  ])('maps the body-parser error %s', (type, parserStatus, status, code) => {
    const error = Object.assign(new Error('parser'), { type, status: parserStatus });
    const result = respond(error);
    expect(result.status).toBe(status);
    expect(result.body?.code).toBe(code);
  });

  it('does not write when the response was already sent', () => {
    const res = { headersSent: true, status: jest.fn(), json: jest.fn(), set: jest.fn() };
    const host = {
      switchToHttp: () => ({ getRequest: () => ({ id: 'req-1' }), getResponse: () => res }),
    } as unknown as ArgumentsHost;
    new AllExceptionsFilter().catch(new Error('late'), host);
    expect(res.json).not.toHaveBeenCalled();
  });
});
