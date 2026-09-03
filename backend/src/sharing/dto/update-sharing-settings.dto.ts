import { IsEnum } from 'class-validator';
import { SharingMode } from '@prisma/client';

export class UpdateSharingSettingsDto {
  @IsEnum(SharingMode, { message: 'mode must be a valid sharing mode' })
  mode!: SharingMode;
}
