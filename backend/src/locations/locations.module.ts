import { Module } from '@nestjs/common';
import { LocationVisibilityModule } from '../location-visibility/location-visibility.module';
import { LocationHistoryService } from './location-history.service';
import { LocationRateLimitService } from './location-rate-limit.service';
import { LocationRedisService } from './location-redis.service';
import { LocationValidationService } from './location-validation.service';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

@Module({
  imports: [LocationVisibilityModule],
  controllers: [LocationsController],
  providers: [
    LocationsService,
    LocationValidationService,
    LocationRedisService,
    LocationRateLimitService,
    LocationHistoryService,
  ],
  exports: [
    LocationsService,
    LocationValidationService,
    LocationRedisService,
    LocationRateLimitService,
    LocationHistoryService,
  ],
})
export class LocationsModule {}
