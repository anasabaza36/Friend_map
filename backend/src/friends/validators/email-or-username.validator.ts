import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

@ValidatorConstraint({ name: 'emailOrUsername', async: false })
export class EmailOrUsernameConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const object = args.object as { email?: string; username?: string };
    const hasEmail =
      typeof object.email === 'string' && object.email.trim().length > 0;
    const hasUsername =
      typeof object.username === 'string' && object.username.trim().length > 0;

    return (hasEmail && !hasUsername) || (!hasEmail && hasUsername);
  }

  defaultMessage(): string {
    return 'Provide exactly one of email or username';
  }
}

export function EmailOrUsername(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: EmailOrUsernameConstraint,
    });
  };
}
