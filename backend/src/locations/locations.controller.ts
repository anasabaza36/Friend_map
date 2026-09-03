import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types';
import { LocationUpdateDto } from './dto/location-update.dto';
import { LocationsService } from './locations.service';
import {
  LocationHistoryEntry,
  LocationResponse,
} from './types/location.types';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  publishLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LocationUpdateDto,
  ): Promise<LocationResponse> {
    return this.locationsService.publishLocation(user.id, dto);
  }

  @Get('me')
  getOwnLocation(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LocationResponse> {
    return this.locationsService.getOwnCurrentLocation(user.id);
  }

  @Get('users/:userId')
  getFriendLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<LocationResponse> {
    return this.locationsService.getFriendCurrentLocation(user.id, userId);
  }

  @Get('history')
  getOwnHistory(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LocationHistoryEntry[]> {
    return this.locationsService.getOwnHistory(user.id);
  }
}
