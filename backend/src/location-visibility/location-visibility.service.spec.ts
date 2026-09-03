import { Test, TestingModule } from '@nestjs/testing';
import { SharingMode } from '@prisma/client';
import { FriendshipsService } from '../friendships/friendships.service';
import { SharingService } from '../sharing/sharing.service';
import { LocationVisibilityService } from './location-visibility.service';

describe('LocationVisibilityService', () => {
  let service: LocationVisibilityService;
  let friendshipsService: jest.Mocked<Pick<FriendshipsService, 'areFriends'>>;
  let sharingService: jest.Mocked<
    Pick<
      SharingService,
      'getModeForUser' | 'isSelectedFriend' | 'isExceptFriend'
    >
  >;

  const ownerId = '11111111-1111-4111-8111-111111111111';
  const viewerId = '22222222-2222-4222-8222-222222222222';
  const strangerId = '33333333-3333-4333-8333-333333333333';

  beforeEach(async () => {
    friendshipsService = {
      areFriends: jest.fn(),
    };

    sharingService = {
      getModeForUser: jest.fn(),
      isSelectedFriend: jest.fn(),
      isExceptFriend: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationVisibilityService,
        { provide: FriendshipsService, useValue: friendshipsService },
        { provide: SharingService, useValue: sharingService },
      ],
    }).compile();

    service = module.get(LocationVisibilityService);
  });

  it('returns false when viewer equals owner (self)', async () => {
    const result = await service.canViewerSeeOwner(ownerId, ownerId);

    expect(result).toBe(false);
    expect(friendshipsService.areFriends).not.toHaveBeenCalled();
  });

  it('returns false for non-friend regardless of mode', async () => {
    friendshipsService.areFriends.mockResolvedValue(false);
    sharingService.getModeForUser.mockResolvedValue(SharingMode.EVERYONE);

    const result = await service.canViewerSeeOwner(viewerId, ownerId);

    expect(result).toBe(false);
  });

  it('returns false in GHOST mode even for friends', async () => {
    friendshipsService.areFriends.mockResolvedValue(true);
    sharingService.getModeForUser.mockResolvedValue(SharingMode.GHOST);

    const result = await service.canViewerSeeOwner(viewerId, ownerId);

    expect(result).toBe(false);
  });

  it('returns true in EVERYONE mode for confirmed friend', async () => {
    friendshipsService.areFriends.mockResolvedValue(true);
    sharingService.getModeForUser.mockResolvedValue(SharingMode.EVERYONE);

    const result = await service.canViewerSeeOwner(viewerId, ownerId);

    expect(result).toBe(true);
  });

  it('returns false in EVERYONE mode for non-friend', async () => {
    friendshipsService.areFriends.mockResolvedValue(false);

    const result = await service.canViewerSeeOwner(strangerId, ownerId);

    expect(result).toBe(false);
    expect(sharingService.getModeForUser).not.toHaveBeenCalled();
  });

  it('returns true in SELECTED mode when viewer is allowed', async () => {
    friendshipsService.areFriends.mockResolvedValue(true);
    sharingService.getModeForUser.mockResolvedValue(SharingMode.SELECTED);
    sharingService.isSelectedFriend.mockResolvedValue(true);

    const result = await service.canViewerSeeOwner(viewerId, ownerId);

    expect(result).toBe(true);
    expect(sharingService.isSelectedFriend).toHaveBeenCalledWith(ownerId, viewerId);
  });

  it('returns false in SELECTED mode when viewer is not allowed', async () => {
    friendshipsService.areFriends.mockResolvedValue(true);
    sharingService.getModeForUser.mockResolvedValue(SharingMode.SELECTED);
    sharingService.isSelectedFriend.mockResolvedValue(false);

    const result = await service.canViewerSeeOwner(viewerId, ownerId);

    expect(result).toBe(false);
  });

  it('returns false in EXCEPT_SELECTED mode when viewer is blocked', async () => {
    friendshipsService.areFriends.mockResolvedValue(true);
    sharingService.getModeForUser.mockResolvedValue(SharingMode.EXCEPT_SELECTED);
    sharingService.isExceptFriend.mockResolvedValue(true);

    const result = await service.canViewerSeeOwner(viewerId, ownerId);

    expect(result).toBe(false);
    expect(sharingService.isExceptFriend).toHaveBeenCalledWith(ownerId, viewerId);
  });

  it('returns true in EXCEPT_SELECTED mode for normal (non-blocked) friend', async () => {
    friendshipsService.areFriends.mockResolvedValue(true);
    sharingService.getModeForUser.mockResolvedValue(SharingMode.EXCEPT_SELECTED);
    sharingService.isExceptFriend.mockResolvedValue(false);

    const result = await service.canViewerSeeOwner(viewerId, ownerId);

    expect(result).toBe(true);
  });

  it('returns false for invalid relationship (not friends in SELECTED mode)', async () => {
    friendshipsService.areFriends.mockResolvedValue(false);
    sharingService.getModeForUser.mockResolvedValue(SharingMode.SELECTED);

    const result = await service.canViewerSeeOwner(strangerId, ownerId);

    expect(result).toBe(false);
    expect(sharingService.isSelectedFriend).not.toHaveBeenCalled();
  });

  it('returns false for unknown sharing mode', async () => {
    friendshipsService.areFriends.mockResolvedValue(true);
    sharingService.getModeForUser.mockResolvedValue('UNKNOWN' as SharingMode);

    const result = await service.canViewerSeeOwner(viewerId, ownerId);

    expect(result).toBe(false);
  });
});
