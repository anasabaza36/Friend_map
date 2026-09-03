import {
  IsNumber,
  Max,
  Min,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

export function IsValidLocationTimestamp(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isValidLocationTimestamp',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value === 'number') {
            return Number.isFinite(value) && value > 0;
          }

          if (typeof value === 'string') {
            const parsed = Date.parse(value);
            return !Number.isNaN(parsed) && parsed > 0;
          }

          return false;
        },
        defaultMessage(): string {
          return 'timestamp must be a valid ISO-8601 string or Unix milliseconds';
        },
      },
    });
  };
}

export class LocationUpdateDto {
  @IsNumber()
  @Min(-90, { message: 'lat must be between -90 and 90' })
  @Max(90, { message: 'lat must be between -90 and 90' })
  lat!: number;

  @IsNumber()
  @Min(-180, { message: 'lng must be between -180 and 180' })
  @Max(180, { message: 'lng must be between -180 and 180' })
  lng!: number;

  @IsNumber()
  @Min(0, { message: 'accuracy must be greater than or equal to 0' })
  accuracy!: number;

  @IsValidLocationTimestamp()
  timestamp!: number | string;
}
