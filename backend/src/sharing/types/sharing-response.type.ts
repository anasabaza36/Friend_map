import { SharingMode } from '@prisma/client';
import { UserSummary } from '../../common/types/user-summary.type';

export type SharingSettingsResponse = {
  mode: SharingMode;
  selectedFriends: UserSummary[];
  exceptFriends: UserSummary[];
};
