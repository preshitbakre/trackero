import { describe, it, expect } from 'vitest';
import { checkPassword, validatePassword, passwordStrength } from './password';

describe('checkPassword', () => {
  it('returns all-true for a valid password', () => {
    const r = checkPassword('Hello1!x');
    expect(r).toEqual({
      hasLength: true, hasLower: true, hasUpper: true,
      hasNumber: true, hasSpecial: true, notTooLong: true,
    });
  });

  it('detects too short', () => {
    expect(checkPassword('Hi1!').hasLength).toBe(false);
  });

  it('detects too long', () => {
    expect(checkPassword('A'.repeat(21) + 'a1!').notTooLong).toBe(false);
  });

  it('detects missing lowercase', () => {
    expect(checkPassword('HELLO123!').hasLower).toBe(false);
  });

  it('detects missing uppercase', () => {
    expect(checkPassword('hello123!').hasUpper).toBe(false);
  });

  it('detects missing number', () => {
    expect(checkPassword('HelloWorld!').hasNumber).toBe(false);
  });

  it('detects missing special character', () => {
    expect(checkPassword('Hello123x').hasSpecial).toBe(false);
  });
});

describe('validatePassword', () => {
  it('returns null for valid password', () => {
    expect(validatePassword('Hello1!x')).toBeNull();
  });

  it('returns specific message for too short', () => {
    expect(validatePassword('Hi1!')).toContain('at least');
  });

  it('returns specific message for missing uppercase', () => {
    expect(validatePassword('hello123!')).toContain('uppercase');
  });
});

describe('passwordStrength', () => {
  it('returns 0 segments for empty string', () => {
    expect(passwordStrength('')).toEqual({ segments: 0, label: '' });
  });

  it('returns weak for minimal password', () => {
    const r = passwordStrength('aaaa');
    expect(r.label).toBe('weak');
  });

  it('returns strong for password meeting all criteria', () => {
    const r = passwordStrength('Hello1!x');
    expect(r.label).toBe('strong');
    expect(r.segments).toBe(4);
  });
});
