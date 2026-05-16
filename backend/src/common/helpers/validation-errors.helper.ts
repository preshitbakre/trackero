import { ValidationError as ClassValidatorError } from 'class-validator';

interface ValidationErrorItem {
  error: string;
  message: string;
}

export function flattenValidationErrors(
  errors: ClassValidatorError[],
): ValidationErrorItem[] {
  const result: ValidationErrorItem[] = [];

  function walk(err: ClassValidatorError, prefix: string): void {
    const isArrayIndex = /^\d+$/.test(err.property);
    const path = isArrayIndex
      ? `${prefix}[${err.property}]`
      : prefix
        ? `${prefix}.${err.property}`
        : err.property;

    if (err.constraints) {
      const message = Object.values(err.constraints).join(', ');
      result.push({ error: path, message });
    }

    if (err.children && err.children.length > 0) {
      for (const child of err.children) {
        walk(child, path);
      }
    }
  }

  for (const error of errors) {
    walk(error, '');
  }

  return result;
}
