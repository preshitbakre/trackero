export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 20;

export interface PasswordCheck {
  hasLength: boolean;
  hasLower: boolean;
  hasUpper: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  notTooLong: boolean;
}

export function checkPassword(pw: string): PasswordCheck {
  return {
    hasLength: pw.length >= PASSWORD_MIN,
    hasLower: /[a-z]/.test(pw),
    hasUpper: /[A-Z]/.test(pw),
    hasNumber: /[0-9]/.test(pw),
    hasSpecial: /[^A-Za-z0-9]/.test(pw),
    notTooLong: pw.length <= PASSWORD_MAX,
  };
}

export function validatePassword(pw: string): string | null {
  const c = checkPassword(pw);
  if (!c.hasLength) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (!c.notTooLong) return `Password must be at most ${PASSWORD_MAX} characters.`;
  if (!c.hasLower) return 'Password must contain a lowercase letter.';
  if (!c.hasUpper) return 'Password must contain an uppercase letter.';
  if (!c.hasNumber) return 'Password must contain at least one number.';
  if (!c.hasSpecial) return 'Password must contain at least one special character.';
  return null;
}

export function passwordStrength(pw: string): { segments: number; label: string } {
  if (pw.length === 0) return { segments: 0, label: '' };
  const c = checkPassword(pw);
  const passed = [c.hasLength && c.notTooLong, c.hasLower && c.hasUpper, c.hasNumber, c.hasSpecial]
    .filter(Boolean).length;
  const label = passed <= 1 ? 'weak' : passed <= 3 ? 'fair' : 'strong';
  return { segments: passed, label };
}
