import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { type ApiError, ErrorCode, type ValidationErrorDetail } from '@auth-app/shared';

export class ValidationErrorDetailDto implements ValidationErrorDetail {
  @ApiProperty({ example: 'password' })
  field!: string;

  @ApiProperty({ example: 'At least one number' })
  message!: string;
}

export class ApiErrorDto implements ApiError {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({ example: 'Validation failed' })
  message!: string;

  @ApiProperty({ enum: Object.values(ErrorCode), example: ErrorCode.VALIDATION_ERROR })
  code!: ErrorCode;

  @ApiProperty({ example: '3f2b6c1e-9a4d-4c51-8f7e-2d1a0b9c8e7f' })
  requestId!: string;

  @ApiPropertyOptional({ type: [ValidationErrorDetailDto], description: 'Validation errors only' })
  details?: ValidationErrorDetailDto[];
}
