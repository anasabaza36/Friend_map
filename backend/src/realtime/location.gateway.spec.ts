import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { SharingMode } from '@prisma/client';
import { REDIS_CLIENT } from '../redis/redis.service';
import { FriendshipsService } from '../friendships/friendships.service';
import { LocationHistoryService } from '../locations/location-history.service';
import { LocationRedisService } from '../locations/location-redis.service';
import { LocationValidationService } from '../locations/location-validation.service';
import { LocationVisibilityService } from '../location-visibility/location-visibility.service';
import { LocationGateway } from './location.gateway';
import { PresenceService } from './presence.service';
import { PrivacyRealtimeService } from './privacy-realtime.service';
import { SocketJwtAuthService } from './socket-jwt-auth.service';
import { StopViewingService } from './stop-viewing.service';
import {
  SOCKET_EVENT_ERROR,
  SOCKET_EVENT_LOCATION_HIDDEN,
  SOCKET_EVENT_LOCATION_UPDATED,
  userRoom,
} from './constants/realtime.constants';
import { AuthenticatedSocket } from './types/realtime.types';
import { StoredLocation } from '../locations/types/location.types';
import { AuthenticatedUser } from '../common/types';

type MockSocket = {
  id: string;
  data: { user?: AuthenticatedUser };
  user?: AuthenticatedUser;
  handshake: {
    auth: { token?: string };
    query: { token?: string };
    headers: Record<string, string | string[] | undefined>;
  };
  join: jest.Mock;
  leave: jest.Mock;
  emit: jest.Mock;
  disconnect: jest.Mock;
  to: jest.Mock;
  rooms: Set<string>;
};

function makeMockSocket(id: string, user?: AuthenticatedUser): MockSocket {
  const emitSpy = jest.fn();
  return {
    id,
    data: user ? { user } : {},
    user,
    handshake: { auth: {}, query: {}, headers: {} },
    join: jest.fn(),
    leave: jest.fn(),
    emit: emitSpy,
    disconnect: jest.fn(),
    to: jest.fn(() => ({ emit: emitSpy })),
    rooms: new Set(),
  };
}

function makeUser(
  id: string,
  username: string,
  email: string,
): AuthenticatedUser {
  const now = new Date('2026-09-02T12:00:00.000Z');
  return {
    id,
    username,
    email,
    avatarUrl: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('LocationGateway (security scenarios)', () => {
  let gateway: LocationGateway;

  const alice = makeUser(
    'alice-1111-4111-8111-alicealice01',
    'alice',
    'alice@example.com',
  );
  const bob = makeUser(
    'bob-2222-4222-8222-bobbobbobb02',
    'bob',
    'bob@example.com',
  );
  const charlie = makeUser(
    'charlie-3333-4333-8333-charliecharlie03',
    'charlie',
    'charlie@example.com',
  );

  const now = new Date('2026-09-02T12:00:00.000Z');

  const redisClientMock = {
    duplicate: jest.fn(() => ({} as never)),
    on: jest.fn(),
  };

  const jwtAuth = {
    extractToken: jest.fn(),
    authenticate: jest.fn(),
  };

  const validationService = {
    normalizeTimestamp: jest.fn((v: number | string) =>
      typeof v === 'number' ? v : Date.parse(v),
    ),
    validateUpdate: jest.fn(),
    toStoredLocation: jest.fn(
      (u: StoredLocation): StoredLocation => u,
    ),
  };

  const locationRedis = {
    getCurrentLocation: jest.fn(),
    setCurrentLocation: jest.fn(),
    deleteCurrentLocation: jest.fn(),
  };

  const historyService = {
    saveEntry: jest.fn(),
    getOwnHistory: jest.fn(),
  };

  const visibilityService = {
    canViewerSeeOwner: jest.fn(),
  };

  const friendshipsService = {
    areFriends: jest.fn(),
    getFriendIds: jest.fn(),
  };

  const presenceService = {
    markOnline: jest.fn(),
    markOffline: jest.fn(),
    heartbeat: jest.fn(),
  };

  const privacyRealtime = {
    setGateway: jest.fn(),
    notifySharingModeChanged: jest.fn(),
    notifySharingListChanged: jest.fn(),
  };

  const stopViewing = {
    isViewingStopped: jest.fn(),
    stopViewing: jest.fn(),
    startViewing: jest.fn(),
    clearAllForSession: jest.fn(),
  };

  const targetRoomEmits: Map<string, Array<{ event: string; payload: unknown }>> =
    new Map();

  let mockServer: {
    to: jest.Mock<{ emit: jest.Mock }, [string]>;
    emit: jest.Mock;
  };

  beforeEach(async () => {
    targetRoomEmits.clear();
    const serverEmit = jest.fn();
    mockServer = {
      to: jest.fn((room: string) => {
        const emitFn = jest.fn((event: string, payload: unknown) => {
          const list = targetRoomEmits.get(room) ?? [];
          list.push({ event, payload });
          targetRoomEmits.set(room, list);
        });
        return { emit: emitFn };
      }),
      emit: serverEmit,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationGateway,
        { provide: REDIS_CLIENT, useValue: redisClientMock },
        { provide: SocketJwtAuthService, useValue: jwtAuth },
        { provide: LocationValidationService, useValue: validationService },
        { provide: LocationRedisService, useValue: locationRedis },
        { provide: LocationHistoryService, useValue: historyService },
        { provide: LocationVisibilityService, useValue: visibilityService },
        { provide: FriendshipsService, useValue: friendshipsService },
        { provide: PresenceService, useValue: presenceService },
        { provide: PrivacyRealtimeService, useValue: privacyRealtime },
        { provide: StopViewingService, useValue: stopViewing },
        { provide: JwtService, useValue: { verify: jest.fn(), sign: jest.fn() } },
      ],
    }).compile();

    gateway = module.get(LocationGateway);
    gateway.server = mockServer as unknown as LocationGateway['server'];

    jest.clearAllMocks();
    targetRoomEmits.clear();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('WebSocket authentication', () => {
    it('disconnects sockets without a JWT token', async () => {
      const socket = makeMockSocket('s-no-token');
      jwtAuth.extractToken.mockReturnValue(null);

      await gateway.handleConnection(socket as unknown as AuthenticatedSocket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.emit).toHaveBeenCalledWith(
        SOCKET_EVENT_ERROR,
        expect.objectContaining({ code: 'AUTH_TOKEN_MISSING' }),
      );
    });

    it('disconnects sockets with an invalid JWT', async () => {
      const socket = makeMockSocket('s-invalid');
      jwtAuth.extractToken.mockReturnValue('bad-token');
      jwtAuth.authenticate.mockRejectedValue(new Error('INVALID_TOKEN'));

      await gateway.handleConnection(socket as unknown as AuthenticatedSocket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.emit).toHaveBeenCalledWith(
        SOCKET_EVENT_ERROR,
        expect.objectContaining({ code: 'INVALID_TOKEN' }),
      );
    });

    it('joins user room and marks presence online when authenticated', async () => {
      const socket = makeMockSocket('s-auth');
      socket.handshake.auth.token = 'good-token';
      jwtAuth.extractToken.mockReturnValue('good-token');
      jwtAuth.authenticate.mockResolvedValue(alice);

      await gateway.handleConnection(socket as unknown as AuthenticatedSocket);

      expect(socket.join).toHaveBeenCalledWith(userRoom(alice.id));
      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(presenceService.markOnline).toHaveBeenCalledWith(alice.id);
      expect(socket.data.user).toBe(alice);
    });

    it('updates presence offline on disconnect', async () => {
      const socket = makeMockSocket('s-disc', alice);

      await gateway.handleDisconnect(socket as unknown as AuthenticatedSocket);

      expect(presenceService.markOffline).toHaveBeenCalledWith(alice.id);
      expect(stopViewing.clearAllForSession).toHaveBeenCalledWith(
        socket.id,
        alice.id,
      );
    });
  });

  describe('Scenario D (Bob pretends to be Alice — server rejects spoofed identity)', () => {
    it('always uses the JWT identity and never trusts a client-provided userId', async () => {
      const socket = makeMockSocket('s-bob', bob);

      const dto = {
        lat: 48.8566,
        lng: 2.3522,
        accuracy: 10,
        timestamp: now.getTime(),
      };

      validationService.validateUpdate.mockReturnValue({ valid: true });
      locationRedis.getCurrentLocation.mockResolvedValue(null);
      friendshipsService.getFriendIds.mockResolvedValue([]);

      await gateway.handleLocationUpdate(
        socket as unknown as AuthenticatedSocket,
        dto,
      );

      expect(locationRedis.setCurrentLocation).toHaveBeenCalledWith(
        bob.id,
        expect.objectContaining({ lat: dto.lat, lng: dto.lng }),
      );
      expect(locationRedis.setCurrentLocation).not.toHaveBeenCalledWith(
        alice.id,
        expect.anything(),
      );
      expect(historyService.saveEntry).toHaveBeenCalledWith(
        bob.id,
        expect.anything(),
      );
    });
  });

  describe('Scenario A (Alice mode=Everyone → Bob receives location)', () => {
    it('broadcasts location:updated to authorized friend Bob and never to strangers', async () => {
      const socketAlice = makeMockSocket('s-alice', alice);
      const dto = {
        lat: 48.8566,
        lng: 2.3522,
        accuracy: 10,
        timestamp: now.getTime(),
      };

      validationService.validateUpdate.mockReturnValue({ valid: true });
      locationRedis.getCurrentLocation.mockResolvedValue(null);
      friendshipsService.getFriendIds.mockResolvedValue([bob.id]);
      visibilityService.canViewerSeeOwner.mockResolvedValue(true);
      stopViewing.isViewingStopped.mockResolvedValue(false);

      await gateway.handleLocationUpdate(
        socketAlice as unknown as AuthenticatedSocket,
        dto,
      );

      const bobRoomEmits = targetRoomEmits.get(userRoom(bob.id)) ?? [];
      expect(bobRoomEmits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: SOCKET_EVENT_LOCATION_UPDATED,
            payload: expect.objectContaining({
              userId: alice.id,
              lat: dto.lat,
              lng: dto.lng,
            }),
          }),
        ]),
      );

      const charlieRoomEmits = targetRoomEmits.get(userRoom(charlie.id)) ?? [];
      expect(charlieRoomEmits).toEqual([]);
    });
  });

  describe('Scenario C (Charlie NOT a friend — never receives Alice)', () => {
    it('never queues a location:updated for non-friend Charlie even when mode=Everyone', async () => {
      const socketAlice = makeMockSocket('s-alice', alice);
      const dto = {
        lat: 48.8566,
        lng: 2.3522,
        accuracy: 10,
        timestamp: now.getTime(),
      };

      validationService.validateUpdate.mockReturnValue({ valid: true });
      locationRedis.getCurrentLocation.mockResolvedValue(null);
      friendshipsService.getFriendIds.mockResolvedValue([bob.id]);
      visibilityService.canViewerSeeOwner.mockResolvedValue(true);
      stopViewing.isViewingStopped.mockResolvedValue(false);

      await gateway.handleLocationUpdate(
        socketAlice as unknown as AuthenticatedSocket,
        dto,
      );

      expect(friendshipsService.getFriendIds).toHaveBeenCalledWith(alice.id);
      expect(visibilityService.canViewerSeeOwner).not.toHaveBeenCalledWith(
        charlie.id,
        alice.id,
      );
      const charlieEmits = targetRoomEmits.get(userRoom(charlie.id)) ?? [];
      expect(charlieEmits).toEqual([]);
    });
  });

  describe('Ghost mode rejects delivery', () => {
    it('does not send location:updated when visibility returns false', async () => {
      const socketAlice = makeMockSocket('s-alice', alice);
      const dto = {
        lat: 48.8566,
        lng: 2.3522,
        accuracy: 10,
        timestamp: now.getTime(),
      };

      validationService.validateUpdate.mockReturnValue({ valid: true });
      locationRedis.getCurrentLocation.mockResolvedValue(null);
      friendshipsService.getFriendIds.mockResolvedValue([bob.id]);
      visibilityService.canViewerSeeOwner.mockResolvedValue(false);
      stopViewing.isViewingStopped.mockResolvedValue(false);

      await gateway.handleLocationUpdate(
        socketAlice as unknown as AuthenticatedSocket,
        dto,
      );

      const bobRoomEmits = targetRoomEmits.get(userRoom(bob.id)) ?? [];
      const hasLocationUpdated = bobRoomEmits.some(
        (entry) => entry.event === SOCKET_EVENT_LOCATION_UPDATED,
      );
      expect(hasLocationUpdated).toBe(false);
    });
  });

  describe('SELECTED mode: only selected viewer receives updates', () => {
    it('calls visibility canViewerSeeOwner per friend and only emits to allowed ones', async () => {
      const socketAlice = makeMockSocket('s-alice', alice);
      const dto = {
        lat: 48.8566,
        lng: 2.3522,
        accuracy: 10,
        timestamp: now.getTime(),
      };

      validationService.validateUpdate.mockReturnValue({ valid: true });
      locationRedis.getCurrentLocation.mockResolvedValue(null);
      friendshipsService.getFriendIds.mockResolvedValue([bob.id, charlie.id]);
      visibilityService.canViewerSeeOwner.mockImplementation(
        (viewerId: string, ownerId: string) =>
          Promise.resolve(viewerId === bob.id && ownerId === alice.id),
      );
      stopViewing.isViewingStopped.mockResolvedValue(false);

      await gateway.handleLocationUpdate(
        socketAlice as unknown as AuthenticatedSocket,
        dto,
      );

      expect(visibilityService.canViewerSeeOwner).toHaveBeenCalledWith(
        bob.id,
        alice.id,
      );
      expect(visibilityService.canViewerSeeOwner).toHaveBeenCalledWith(
        charlie.id,
        alice.id,
      );

      const bobEmits = targetRoomEmits.get(userRoom(bob.id)) ?? [];
      const charlieEmits = targetRoomEmits.get(userRoom(charlie.id)) ?? [];
      expect(
        bobEmits.some((e) => e.event === SOCKET_EVENT_LOCATION_UPDATED),
      ).toBe(true);
      expect(
        charlieEmits.some((e) => e.event === SOCKET_EVENT_LOCATION_UPDATED),
      ).toBe(false);
    });
  });

  describe('EXCEPT_SELECTED mode: blocked friend receives nothing', () => {
    it('emits to charlie but withholds from bob when bob is except friend', async () => {
      const socketAlice = makeMockSocket('s-alice', alice);
      const dto = {
        lat: 48.8566,
        lng: 2.3522,
        accuracy: 10,
        timestamp: now.getTime(),
      };

      validationService.validateUpdate.mockReturnValue({ valid: true });
      locationRedis.getCurrentLocation.mockResolvedValue(null);
      friendshipsService.getFriendIds.mockResolvedValue([bob.id, charlie.id]);
      visibilityService.canViewerSeeOwner.mockImplementation(
        (viewerId: string, ownerId: string) =>
          Promise.resolve(
            !(viewerId === bob.id && ownerId === alice.id),
          ),
      );
      stopViewing.isViewingStopped.mockResolvedValue(false);

      await gateway.handleLocationUpdate(
        socketAlice as unknown as AuthenticatedSocket,
        dto,
      );

      const bobEmits = targetRoomEmits.get(userRoom(bob.id)) ?? [];
      const charlieEmits = targetRoomEmits.get(userRoom(charlie.id)) ?? [];
      expect(
        bobEmits.some((e) => e.event === SOCKET_EVENT_LOCATION_UPDATED),
      ).toBe(false);
      expect(
        charlieEmits.some((e) => e.event === SOCKET_EVENT_LOCATION_UPDATED),
      ).toBe(true);
    });
  });

  describe('Stale & impossible movement (gateway emits error codes)', () => {
    it('emits an error event (and no broadcast) for STALE_TIMESTAMP', async () => {
      const socketAlice = makeMockSocket('s-alice', alice);
      const dto = {
        lat: 48.8566,
        lng: 2.3522,
        accuracy: 10,
        timestamp: now.getTime() - 10 * 60 * 1000,
      };

      validationService.validateUpdate.mockReturnValue({
        valid: false,
        reason: 'STALE_TIMESTAMP',
        message: 'Stale',
      });
      locationRedis.getCurrentLocation.mockResolvedValue(null);

      await gateway.handleLocationUpdate(
        socketAlice as unknown as AuthenticatedSocket,
        dto,
      );

      expect(socketAlice.emit).toHaveBeenCalledWith(
        SOCKET_EVENT_ERROR,
        expect.objectContaining({ code: 'STALE_TIMESTAMP' }),
      );
      expect(locationRedis.setCurrentLocation).not.toHaveBeenCalled();
      expect(mockServer.emit).not.toHaveBeenCalled();
    });

    it('emits error for IMPOSSIBLE_MOVEMENT and does not save', async () => {
      const socketAlice = makeMockSocket('s-alice', alice);
      const dto = {
        lat: 40.7128,
        lng: -74.006,
        accuracy: 10,
        timestamp: now.getTime(),
      };

      validationService.validateUpdate.mockReturnValue({
        valid: false,
        reason: 'IMPOSSIBLE_MOVEMENT',
        message: 'Too fast',
      });
      locationRedis.getCurrentLocation.mockResolvedValue({
        lat: 48.8566,
        lng: 2.3522,
        accuracy: 10,
        timestamp: now.getTime() - 1_000,
      });

      await gateway.handleLocationUpdate(
        socketAlice as unknown as AuthenticatedSocket,
        dto,
      );

      expect(socketAlice.emit).toHaveBeenCalledWith(
        SOCKET_EVENT_ERROR,
        expect.objectContaining({ code: 'IMPOSSIBLE_MOVEMENT' }),
      );
      expect(locationRedis.setCurrentLocation).not.toHaveBeenCalled();
    });
  });

  describe('Unauthenticated location:update is rejected', () => {
    it('emits NOT_AUTHENTICATED error and skips validation/save', async () => {
      const socket = makeMockSocket('s-stray');

      const dto = {
        lat: 0,
        lng: 0,
        accuracy: 0,
        timestamp: now.getTime(),
      };

      await gateway.handleLocationUpdate(
        socket as unknown as AuthenticatedSocket,
        dto,
      );

      expect(socket.emit).toHaveBeenCalledWith(
        SOCKET_EVENT_ERROR,
        expect.objectContaining({ code: 'NOT_AUTHENTICATED' }),
      );
      expect(validationService.validateUpdate).not.toHaveBeenCalled();
      expect(locationRedis.setCurrentLocation).not.toHaveBeenCalled();
    });
  });

  describe('Stop viewing (session-level)', () => {
    it('after viewing:stop Bob no longer receives Alice even though visibility allows it', async () => {
      await gateway.handleStopViewing(
        makeMockSocket('s-bob', bob) as unknown as AuthenticatedSocket,
        { ownerId: alice.id },
      );

      expect(stopViewing.stopViewing).toHaveBeenCalledWith(bob.id, alice.id);

      stopViewing.isViewingStopped.mockImplementation(
        (viewerId, ownerId) =>
          Promise.resolve(viewerId === bob.id && ownerId === alice.id),
      );

      const socketAlice = makeMockSocket('s-alice', alice);
      validationService.validateUpdate.mockReturnValue({ valid: true });
      locationRedis.getCurrentLocation.mockResolvedValue(null);
      friendshipsService.getFriendIds.mockResolvedValue([bob.id]);
      visibilityService.canViewerSeeOwner.mockResolvedValue(true);

      await gateway.handleLocationUpdate(
        socketAlice as unknown as AuthenticatedSocket,
        {
          lat: 48.8566,
          lng: 2.3522,
          accuracy: 10,
          timestamp: now.getTime(),
        },
      );

      const bobEmits = targetRoomEmits.get(userRoom(bob.id)) ?? [];
      expect(
        bobEmits.some((e) => e.event === SOCKET_EVENT_LOCATION_UPDATED),
      ).toBe(false);
    });
  });

  describe('Privacy revocation: PrivacyRealtimeService integration', () => {
    it('emits location:hidden when PrivacyService tells gateway via emitToRoom', () => {
      gateway.emitToRoom(userRoom(bob.id), SOCKET_EVENT_LOCATION_HIDDEN, {
        userId: alice.id,
      });

      expect(mockServer.to).toHaveBeenCalledWith(userRoom(bob.id));
    });
  });

  describe('No global server.emit for location data', () => {
    it('never calls server.emit during location update path', async () => {
      const socketAlice = makeMockSocket('s-alice', alice);
      validationService.validateUpdate.mockReturnValue({ valid: true });
      locationRedis.getCurrentLocation.mockResolvedValue(null);
      friendshipsService.getFriendIds.mockResolvedValue([bob.id]);
      visibilityService.canViewerSeeOwner.mockResolvedValue(true);
      stopViewing.isViewingStopped.mockResolvedValue(false);

      await gateway.handleLocationUpdate(
        socketAlice as unknown as AuthenticatedSocket,
        {
          lat: 48.8566,
          lng: 2.3522,
          accuracy: 10,
          timestamp: now.getTime(),
        },
      );

      expect(mockServer.emit).not.toHaveBeenCalled();
    });
  });

  describe('Scenario E (Everyone → Selected without Bob): immediate revocation via PrivacyRealtimeService', () => {
    it('after notifySharingListChanged (SELECTED without Bob), Bob receives location:hidden', async () => {
      const roomEmits = new Map<string, unknown>();
      gateway.emitToRoom = jest.fn((room, event, payload) => {
        roomEmits.set(`${room}:${event}`, payload);
      });

      visibilityService.canViewerSeeOwner.mockImplementation(
        (viewerId: string, ownerId: string) =>
          Promise.resolve(
            !(viewerId === bob.id && ownerId === alice.id),
          ),
      );
      friendshipsService.getFriendIds.mockResolvedValue([bob.id, charlie.id]);

      const privacySvc = new PrivacyRealtimeService(
        friendshipsService as unknown as FriendshipsService,
        visibilityService as unknown as LocationVisibilityService,
        {} as never,
        locationRedis as unknown as LocationRedisService,
      );
      privacySvc.setGateway(gateway);

      await privacySvc.notifySharingListChanged(alice.id, SharingMode.SELECTED);

      expect(roomEmits.get(`${userRoom(bob.id)}:location:hidden`)).toEqual({
        userId: alice.id,
      });
      expect(
        roomEmits.has(`${userRoom(charlie.id)}:location:hidden`),
      ).toBe(false);
    });
  });
});
