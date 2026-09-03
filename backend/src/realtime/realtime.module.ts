import { Global, Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LocationVisibilityModule } from '../location-visibility/location-visibility.module';
import { FriendshipsModule } from '../friendships/friendships.module';
import { SharingModule } from '../sharing/sharing.module';
import { LocationsModule } from '../locations/locations.module';
import { UsersModule } from '../users/users.module';
import { LocationGateway } from './location.gateway';
import { PresenceService } from './presence.service';
import { PrivacyRealtimeService } from './privacy-realtime.service';
import { SocketJwtAuthService } from './socket-jwt-auth.service';
import { StopViewingService } from './stop-viewing.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '7d'),
        },
      }),
    }),
    LocationVisibilityModule,
    FriendshipsModule,
    SharingModule,
    LocationsModule,
    UsersModule,
  ],
  providers: [
    LocationGateway,
    PresenceService,
    PrivacyRealtimeService,
    SocketJwtAuthService,
    StopViewingService,
    JwtService,
  ],
  exports: [
    PrivacyRealtimeService,
    PresenceService,
    StopViewingService,
    SocketJwtAuthService,
  ],
})
export class RealtimeModule {}
