import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { REDIS_CLIENT } from '../redis/redis.service';
import { Inject } from '@nestjs/common';
import { LocationUpdateDto } from '../locations/dto/location-update.dto';
import { LocationValidationService } from '../locations/location-validation.service';
import { LocationRedisService } from '../locations/location-redis.service';
import { LocationHistoryService } from '../locations/location-history.service';
import { LocationVisibilityService } from '../location-visibility/location-visibility.service';
import { FriendshipsService } from '../friendships/friendships.service';
import {
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  SOCKET_EVENT_ERROR,
  SOCKET_EVENT_FRIEND_ACCEPTED,
  SOCKET_EVENT_FRIEND_REMOVED,
  SOCKET_EVENT_FRIEND_REQUEST,
  SOCKET_EVENT_LOCATION_HIDDEN,
  SOCKET_EVENT_LOCATION_UPDATE,
  SOCKET_EVENT_LOCATION_UPDATED,
  SOCKET_EVENT_START_VIEWING,
  SOCKET_EVENT_STOP_VIEWING,
  userRoom,
} from './constants/realtime.constants';
import {
  AuthenticatedSocket,
  LocationBroadcastPayload,
  LocationHiddenPayload,
  SocketErrorPayload,
} from './types/realtime.types';
import { StartViewingDto, StopViewingDto } from './dto/viewing.dto';
import { PresenceService } from './presence.service';
import { PrivacyRealtimeService } from './privacy-realtime.service';
import { SocketJwtAuthService } from './socket-jwt-auth.service';
import { StopViewingService } from './stop-viewing.service';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/',
})
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }),
)
export class LocationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(LocationGateway.name);

  @WebSocketServer()
  server: Server | null = null;

  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    private readonly socketJwtAuth: SocketJwtAuthService,
    private readonly locationValidation: LocationValidationService,
    private readonly locationRedis: LocationRedisService,
    private readonly locationHistory: LocationHistoryService,
    private readonly visibilityService: LocationVisibilityService,
    private readonly friendshipsService: FriendshipsService,
    private readonly presenceService: PresenceService,
    private readonly privacyRealtime: PrivacyRealtimeService,
    private readonly stopViewingService: StopViewingService,
    private readonly jwtService: JwtService,
  ) {
    void this.jwtService;
  }

  afterInit(srv: Server): void {
    try {
      const pubClient = this.redisClient.duplicate();
      const subClient = this.redisClient.duplicate();

      let adapterReady = false;
      try {
        const adapter = createAdapter(pubClient, subClient);
        if (typeof adapter === 'function') {
          srv.adapter(adapter);
          adapterReady = true;
        } else if (adapter && typeof (adapter as { createAdapter?: () => any }).createAdapter === 'function') {
          srv.adapter((adapter as { createAdapter: () => any }).createAdapter());
          adapterReady = true;
        }
      } catch (adapterErr) {
        this.logger.warn(
          `Socket.IO Redis adapter failed during construction, falling back to default in-memory adapter: ${
            adapterErr instanceof Error ? adapterErr.message : String(adapterErr)
          }`,
        );
      }

      if (adapterReady) {
        this.logger.log('LocationGateway initialized with Redis adapter');
      } else {
        this.logger.warn('LocationGateway initialized with default in-memory adapter (single-instance mode only)');
      }
      this.privacyRealtime.setGateway(this);
    } catch (err) {
      this.logger.error(
        `Failed to initialize LocationGateway afterInit: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
      this.privacyRealtime.setGateway(this);
    }
  }

  async handleConnection(socket: AuthenticatedSocket): Promise<void> {
    try {
      const token = this.socketJwtAuth.extractToken({
        auth: socket.handshake.auth,
        query: socket.handshake.query as { token?: string },
        headers: socket.handshake.headers,
      });
      if (!token) {
        this.emitError(socket, 'AUTH_TOKEN_MISSING', 'Authentication required');
        socket.disconnect(true);
        return;
      }
      const user = await this.socketJwtAuth.authenticate(token);
      socket.data.user = user;
      socket.user = user;

      await socket.join(userRoom(user.id));
      await this.presenceService.markOnline(user.id);

      this.startHeartbeat(socket.id, user.id);

      this.logger.log(`Socket connected: user=${user.username} socket=${socket.id}`);
    } catch (error) {
      const code =
        error instanceof Error && error.message === 'USER_NOT_FOUND'
          ? 'USER_NOT_FOUND'
          : 'INVALID_TOKEN';
      this.emitError(socket, code, 'Authentication failed');
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: AuthenticatedSocket): Promise<void> {
    const user = socket.data?.user;
    const socketId = socket.id;

    this.stopHeartbeat(socketId);

    if (user) {
      try {
        await this.stopViewingService.clearAllForSession(socketId, user.id);
        await this.presenceService.markOffline(user.id);
        this.logger.log(
          `Socket disconnected: user=${user.username} socket=${socketId}`,
        );
      } catch (err) {
        this.logger.error(
          `Error during disconnect cleanup for socket ${socketId}`,
          err,
        );
      }
    }
  }

  @SubscribeMessage(SOCKET_EVENT_LOCATION_UPDATE)
  async handleLocationUpdate(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() dto: LocationUpdateDto,
  ): Promise<void> {
    const user = socket.data?.user;
    if (!user) {
      this.emitError(socket, 'NOT_AUTHENTICATED', 'Not authenticated');
      return;
    }

    try {
      const update = {
        lat: dto.lat,
        lng: dto.lng,
        accuracy: dto.accuracy,
        timestamp: this.locationValidation.normalizeTimestamp(dto.timestamp),
      };

      const previous = await this.locationRedis.getCurrentLocation(user.id);
      const validation = this.locationValidation.validateUpdate(
        update,
        previous,
      );
      if (!validation.valid) {
        this.emitError(socket, validation.reason, validation.message);
        return;
      }

      const location = this.locationValidation.toStoredLocation(update);
      await this.locationRedis.setCurrentLocation(user.id, location);
      await this.locationHistory.saveEntry(user.id, location);

      const broadcastPayload: LocationBroadcastPayload = {
        userId: user.id,
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy,
        timestamp: location.timestamp,
      };

      await this.broadcastToAuthorizedViewers(user.id, broadcastPayload);
    } catch (err) {
      this.logger.error(`Error handling location update for user ${user.id}`, err);
      this.emitError(socket, 'INTERNAL_ERROR', 'Failed to process update');
    }
  }

  @SubscribeMessage(SOCKET_EVENT_STOP_VIEWING)
  async handleStopViewing(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() dto: StopViewingDto,
  ): Promise<void> {
    const user = socket.data?.user;
    if (!user) {
      this.emitError(socket, 'NOT_AUTHENTICATED', 'Not authenticated');
      return;
    }
    const ownerId = dto?.ownerId;
    if (!ownerId) {
      this.emitError(socket, 'INVALID_PAYLOAD', 'ownerId is required');
      return;
    }
    await this.stopViewingService.stopViewing(user.id, ownerId);
    const hiddenPayload: LocationHiddenPayload = { userId: ownerId };
    socket.emit(SOCKET_EVENT_LOCATION_HIDDEN, hiddenPayload);
  }

  @SubscribeMessage(SOCKET_EVENT_START_VIEWING)
  async handleStartViewing(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() dto: StartViewingDto,
  ): Promise<void> {
    const user = socket.data?.user;
    if (!user) {
      this.emitError(socket, 'NOT_AUTHENTICATED', 'Not authenticated');
      return;
    }
    const ownerId = dto?.ownerId;
    if (!ownerId) {
      this.emitError(socket, 'INVALID_PAYLOAD', 'ownerId is required');
      return;
    }
    await this.stopViewingService.startViewing(user.id, ownerId);
  }

  emitToRoom(room: string, event: string, payload: unknown): void {
    if (this.server) {
      this.server.to(room).emit(event, payload);
    }
  }

  notifyFriendRequestReceived(
    receiverId: string,
    payload: { requestId: string; senderId: string; senderUsername: string },
  ): void {
    if (this.server) {
      this.server.to(userRoom(receiverId)).emit(SOCKET_EVENT_FRIEND_REQUEST, payload);
    }
  }

  notifyFriendAccepted(
    senderId: string,
    payload: { requestId: string; acceptorId: string; acceptorUsername: string },
  ): void {
    if (this.server) {
      this.server.to(userRoom(senderId)).emit(SOCKET_EVENT_FRIEND_ACCEPTED, payload);
    }
  }

  notifyFriendRemoved(
    removedUserId: string,
    payload: { removedByUserId: string; removedByUsername: string },
  ): void {
    if (this.server) {
      this.server.to(userRoom(removedUserId)).emit(SOCKET_EVENT_FRIEND_REMOVED, payload);
    }
  }

  private async broadcastToAuthorizedViewers(
    ownerId: string,
    payload: LocationBroadcastPayload,
  ): Promise<void> {
    if (!this.server) return;

    const friendIds = await this.friendshipsService.getFriendIds(ownerId);

    for (const viewerId of friendIds) {
      const [canSee, stopped] = await Promise.all([
        this.visibilityService.canViewerSeeOwner(viewerId, ownerId),
        this.stopViewingService.isViewingStopped(viewerId, ownerId),
      ]);
      if (canSee && !stopped) {
        this.server.to(userRoom(viewerId)).emit(
          SOCKET_EVENT_LOCATION_UPDATED,
          payload,
        );
      }
    }
  }

  private emitError(
    socket: { emit(event: string, ...args: unknown[]): void },
    code: string,
    message: string,
  ): void {
    const payload: SocketErrorPayload = { code, message };
    socket.emit(SOCKET_EVENT_ERROR, payload);
  }

  private startHeartbeat(socketId: string, userId: string): void {
    const interval = setInterval(() => {
      void this.presenceService.heartbeat(userId).catch((err) => {
        this.logger.error(`Presence heartbeat failed for ${userId}`, err);
      });
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);
    this.heartbeatIntervals.set(socketId, interval);
  }

  private stopHeartbeat(socketId: string): void {
    const interval = this.heartbeatIntervals.get(socketId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(socketId);
    }
  }
}
