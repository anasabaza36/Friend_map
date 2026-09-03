import { Module } from '@nestjs/common';
import { FriendshipsModule } from '../friendships/friendships.module';
import { SharingController } from './sharing.controller';
import { SharingService } from './sharing.service';

@Module({
  imports: [FriendshipsModule],
  controllers: [SharingController],
  providers: [SharingService],
  exports: [SharingService],
})
export class SharingModule {}
