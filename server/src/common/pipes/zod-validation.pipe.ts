import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { ZodType, output } from 'zod';
import { ErrorCode } from '@auth-app/shared';
import { AppException } from '../exceptions/app.exception.js';

/** Validates (and normalizes, strips unknown keys) a value with a shared zod schema. */
export class ZodValidationPipe<Schema extends ZodType> implements PipeTransform<
  unknown,
  output<Schema>
> {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): output<Schema> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      'Validation failed',
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(body)',
        message: issue.message,
      })),
    );
  }
}
