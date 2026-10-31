import { ErrorCode } from '@auth-app/shared';
import { toApiError } from '../api/errors';

export const MESSAGES = {
  emailTaken: 'Email is already registered',
  invalidCredentials: 'Invalid email or password',
  tooManyAttempts: 'Too many attempts, try again later',
  generic: 'Something went wrong. Check your connection and try again.',
} as const;

export interface FormErrors<Field extends string> {
  fields: { name: Field; message: string }[];
  form: string | null;
}

/** Maps an API error from sign-in / sign-up to field errors and a form-level message. */
export function describeAuthError<Field extends string>(
  error: unknown,
  knownFields: readonly Field[],
): FormErrors<Field> {
  const apiError = toApiError(error);
  const isField = (name: string): name is Field =>
    (knownFields as readonly string[]).includes(name);

  switch (apiError?.code) {
    case ErrorCode.EMAIL_TAKEN: {
      const emailField = knownFields.find((field) => field === 'email');
      return emailField
        ? { fields: [{ name: emailField, message: MESSAGES.emailTaken }], form: null }
        : { fields: [], form: MESSAGES.emailTaken };
    }
    case ErrorCode.INVALID_CREDENTIALS:
      return { fields: [], form: MESSAGES.invalidCredentials };
    case ErrorCode.TOO_MANY_REQUESTS:
    case ErrorCode.ACCOUNT_LOCKED:
      return { fields: [], form: MESSAGES.tooManyAttempts };
    case ErrorCode.VALIDATION_ERROR: {
      const fields = (apiError.details ?? [])
        .filter((detail) => isField(detail.field))
        .map((detail) => ({ name: detail.field as Field, message: detail.message }));
      return fields.length > 0 ? { fields, form: null } : { fields, form: apiError.message };
    }
    default:
      return { fields: [], form: MESSAGES.generic };
  }
}
