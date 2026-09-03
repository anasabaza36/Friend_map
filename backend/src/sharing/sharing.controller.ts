import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types';
import { UpdateSharingFriendsDto } from './dto/update-sharing-friends.dto';
import { UpdateSharingSettingsDto } from './dto/update-sharing-settings.dto';
import { SharingService } from './sharing.service';
import { SharingSettingsResponse } from './types/sharing-response.type';

@Controller('sharing-settings')
export class SharingController {
  constructor(private readonly sharingService: SharingService) {}

  @Get()
  getSettings(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SharingSettingsResponse> {
    return this.sharingService.getSettings(user.id);
  }

  @Put()
  updateMode(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSharingSettingsDto,
  ): Promise<SharingSettingsResponse> {
    return this.sharingService.updateMode(user.id, dto);
  }

  @Put('selected')
  updateSelected(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSharingFriendsDto,
  ): Promise<SharingSettingsResponse> {
    return this.sharingService.updateSelectedFriends(user.id, dto);
  }

  @Put('except')
  updateExcept(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSharingFriendsDto,
  ): Promise<SharingSettingsResponse> {
    return this.sharingService.updateExceptFriends(user.id, dto);
  }
}
