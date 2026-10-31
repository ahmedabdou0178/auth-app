import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  passwordRules,
  passwordSchema,
  signInSchema,
  signUpSchema,
  type PasswordRuleId,
} from './schemas.js';

const VALID = { email: 'ada@example.com', name: 'Ada', password: 'Secr3t!pw' };

function passwordIssues(value: string): string[] {
  const result = passwordSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

function failingRules(value: string): PasswordRuleId[] {
  return passwordRules.filter((rule) => !rule.test(value)).map((rule) => rule.id);
}

describe('passwordSchema', () => {
  it('accepts a password meeting every rule', () => {
    expect(passwordIssues('Secr3t!pw')).toEqual([]);
  });

  it.each([
    ['Sh0rt!', 'At least 8 characters'],
    ['12345678!', 'At least one letter'],
    ['Password!', 'At least one number'],
    ['Password1', 'At least one special character'],
  ])('rejects %s with "%s"', (value, message) => {
    expect(passwordIssues(value)).toEqual([message]);
  });

  it('rejects passwords longer than 128 characters', () => {
    expect(passwordIssues(`a1!${'x'.repeat(126)}`)).toEqual(['At most 128 characters']);
  });
});

describe('passwordRules', () => {
  it.each([
    'Sh0rt!',
    '12345678!',
    'Password!',
    'Password1',
    'Secr3t!pw',
    '',
    'aaaaaaaa',
    ' 1a      ',
  ])('agrees with passwordSchema for %j', (value) => {
    const ruleLabels = passwordRules
      .filter((rule) => failingRules(value).includes(rule.id))
      .map((rule) => rule.label);
    expect(ruleLabels).toEqual(passwordIssues(value));
  });

  it('lists the four rules in display order', () => {
    expect(passwordRules.map((rule) => rule.id)).toEqual([
      'minLength',
      'letter',
      'number',
      'special',
    ]);
  });
});

describe('emailSchema', () => {
  it('trims and lowercases before validating', () => {
    expect(emailSchema.parse('  Ada@Example.COM ')).toBe('ada@example.com');
  });

  it('rejects an invalid email', () => {
    const result = emailSchema.safeParse('not-an-email');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Enter a valid email address');
  });

  it('rejects an email longer than 254 characters', () => {
    const result = emailSchema.safeParse(`${'a'.repeat(250)}@example.com`);
    expect(result.error?.issues.map((issue) => issue.message)).toContain('Email is too long');
  });
});

describe('signUpSchema', () => {
  it('trims the name and strips unknown keys', () => {
    const parsed = signUpSchema.parse({ ...VALID, name: '  Ada  ', role: 'admin' });
    expect(parsed).toEqual(VALID);
  });

  it('rejects a name shorter than 3 characters after trimming', () => {
    const result = signUpSchema.safeParse({ ...VALID, name: ' Al ' });
    expect(result.error?.issues[0]).toMatchObject({
      path: ['name'],
      message: 'Name must be at least 3 characters',
    });
  });
});

describe('signInSchema', () => {
  it('does not apply password complexity rules', () => {
    expect(signInSchema.safeParse({ email: VALID.email, password: 'x' }).success).toBe(true);
  });

  it('requires a password', () => {
    const result = signInSchema.safeParse({ email: VALID.email, password: '' });
    expect(result.error?.issues[0]?.message).toBe('Password is required');
  });
});
