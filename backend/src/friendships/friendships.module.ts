import { Module } from '@nestjs/common';
import { FriendshipsService } from './friendships.service';

@Module({
  providers: [FriendshipsService],
  exports: [FriendshipsService],
})
export class FriendshipsModule {}
