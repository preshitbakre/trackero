import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const MIN_LENGTH = 8;
const MAX_LENGTH = 20;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,20}$/;

@ValidatorConstraint({ async: false })
class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return PASSWORD_REGEX.test(value);
  }

  defaultMessage(): string {
    return `Password must be ${MIN_LENGTH}–${MAX_LENGTH} characters and include at least one uppercase letter, one lowercase letter, one number, and one special character.`;
  }
}

export function IsStrongPassword(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsStrongPasswordConstraint,
    });
  };
}
