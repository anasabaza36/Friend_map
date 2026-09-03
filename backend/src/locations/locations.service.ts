import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LocationVisibilityService } from '../location-visibility/location-visibility.service';
import { LocationUpdateDto } from './dto/location-update.dto';
import { LocationHistoryService } from './location-history.service';
import { LocationRateLimitService } from './location-rate-limit.service';
import { LocationRedisService } from './location-redis.service';
import { LocationValidationService } from './location-validation.service';
import {
  LocationHistoryEntry,
  LocationResponse,
} from './types/location.types';

@Injectable()
export class LocationsService {
  constructor(
    private readonly validationService: LocationValidationService,
    private readonly redisService: LocationRedisService,
    private readonly rateLimitService: LocationRateLimitService,
    private readonly historyService: LocationHistoryService,
    private readonly visibilityService: LocationVisibilityService,
  ) {}

  async publishLocation(
    userId: string,
    dto: LocationUpdateDto,
  ): Promise<LocationResponse> {
    await this.rateLimitService.assertWithinLimit(userId);

    const update = {
      lat: dto.lat,
      lng: dto.lng,
      accuracy: dto.accuracy,
      timestamp: this.validationService.normalizeTimestamp(dto.timestamp),
    };

    const previous = await this.redisService.getCurrentLocation(userId);
    const validation = this.validationService.validateUpdate(update, previous);

    if (!validation.valid) {
      throw new BadRequestException(validation.message);
    }

    const location = this.validationService.toStoredLocation(update);

    await this.redisService.setCurrentLocation(userId, location);
    await this.historyService.saveEntry(userId, location);

    return { ...location, userId };
  }

  async getOwnCurrentLocation(userId: string): Promise<LocationResponse> {
    const location = await this.redisService.getCurrentLocation(userId);

    if (!location) {
      throw new NotFoundException('No current location available');
    }

    return { ...location, userId };
  }

  async getFriendCurrentLocation(
    viewerId: string,
    ownerId: string,
  ): Promise<LocationResponse> {
    if (viewerId === ownerId) {
      return this.getOwnCurrentLocation(viewerId);
    }

    const canView = await this.visibilityService.canViewerSeeOwner(
      viewerId,
      ownerId,
    );

    if (!canView) {
      throw new ForbiddenException(
        'You are not allowed to view this user\'s location',
      );
    }

    const location = await this.redisService.getCurrentLocation(ownerId);

    if (!location) {
      throw new NotFoundException('No current location available for this user');
    }

    return { ...location, userId: ownerId };
  }

  async getOwnHistory(userId: string): Promise<LocationHistoryEntry[]> {
    return this.historyService.getOwnHistory(userId);
  }
}
