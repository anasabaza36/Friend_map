import { Module } from '@nestjs/common';
import { FriendshipsModule } from '../friendships/friendships.module';
import { SharingModule } from '../sharing/sharing.module';
import { LocationVisibilityService } from './location-visibility.service';

@Module({
  imports: [FriendshipsModule, SharingModule],
  providers: [LocationVisibilityService],
  exports: [LocationVisibilityService],
})
export class LocationVisibilityModule {}
