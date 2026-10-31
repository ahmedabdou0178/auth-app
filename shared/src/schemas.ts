import { z } from 'zod';

export const EMAIL_MAX_LENGTH = 254;
export const NAME_MIN_LENGTH = 3;
export const NAME_MAX_LENGTH = 50;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_LETTER_REGEX = /[A-Za-z]/;
export const PASSWORD_NUMBER_REGEX = /\d/;
export const PASSWORD_SPECIAL_REGEX = /[^A-Za-z0-9]/;

const PASSWORD_MESSAGES = {
  minLength: `At least ${PASSWORD_MIN_LENGTH} characters`,
  letter: 'At least one letter',
  number: 'At least one number',
  special: 'At least one special character',
} as const;

/** Trimmed and lowercased before the format check, so stored emails are normalized. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(EMAIL_MAX_LENGTH, 'Email is too long'));

export const nameSchema = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH, `Name must be at least ${NAME_MIN_LENGTH} characters`)
  .max(NAME_MAX_LENGTH, `Name must be at most ${NAME_MAX_LENGTH} characters`);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, PASSWORD_MESSAGES.minLength)
  .max(PASSWORD_MAX_LENGTH, `At most ${PASSWORD_MAX_LENGTH} characters`)
  .regex(PASSWORD_LETTER_REGEX, PASSWORD_MESSAGES.letter)
  .regex(PASSWORD_NUMBER_REGEX, PASSWORD_MESSAGES.number)
  .regex(PASSWORD_SPECIAL_REGEX, PASSWORD_MESSAGES.special);

export const signUpSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
});

/** Sign-in deliberately skips complexity rules: they only apply when a password is chosen. */
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

export type PasswordRuleId = keyof typeof PASSWORD_MESSAGES;

export interface PasswordRule {
  id: PasswordRuleId;
  label: string;
  test: (value: string) => boolean;
}

/** Drives the live checklist in the sign-up form; built from the same constants as `passwordSchema`. */
export const passwordRules: readonly PasswordRule[] = [
  {
    id: 'minLength',
    label: PASSWORD_MESSAGES.minLength,
    test: (value) => value.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'letter',
    label: PASSWORD_MESSAGES.letter,
    test: (value) => PASSWORD_LETTER_REGEX.test(value),
  },
  {
    id: 'number',
    label: PASSWORD_MESSAGES.number,
    test: (value) => PASSWORD_NUMBER_REGEX.test(value),
  },
  {
    id: 'special',
    label: PASSWORD_MESSAGES.special,
    test: (value) => PASSWORD_SPECIAL_REGEX.test(value),
  },
];
