import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SocketJwtAuthService } from './socket-jwt-auth.service';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser } from '../common/types';

describe('SocketJwtAuthService', () => {
  let service: SocketJwtAuthService;

  const jwtService = { verify: jest.fn(), sign: jest.fn() };
  const configService = { get: jest.fn() };
  const usersService = { findById: jest.fn(), toSafeUser: jest.fn() };

  const testUser: AuthenticatedUser = {
    id: 'user-1111-4111-8111-useruseruser01',
    username: 'alice',
    email: 'alice@example.com',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocketJwtAuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();
    service = module.get(SocketJwtAuthService);
  });

  describe('extractToken', () => {
    it('prefers handshake.auth.token', () => {
      const token = service.extractToken({
        auth: { token: 'auth-token' },
        query: { token: 'query-token' },
        headers: { authorization: 'Bearer header-token' },
      });
      expect(token).toBe('auth-token');
    });

    it('falls back to query.token', () => {
      const token = service.extractToken({
        auth: {},
        query: { token: 'query-token' },
        headers: {},
      });
      expect(token).toBe('query-token');
    });

    it('falls back to Bearer header', () => {
      const token = service.extractToken({
        auth: {},
        query: {},
        headers: { authorization: 'Bearer header-token' },
      });
      expect(token).toBe('header-token');
    });

    it('returns null when nothing is provided', () => {
      expect(service.extractToken({ auth: {}, query: {}, headers: {} })).toBeNull();
    });
  });

  describe('authenticate', () => {
    it('returns AuthenticatedUser when JWT and user are valid', async () => {
      configService.get.mockReturnValue('super-secret');
      jwtService.verify.mockReturnValue({ sub: testUser.id });
      usersService.findById.mockResolvedValue({ id: testUser.id });
      usersService.toSafeUser.mockReturnValue(testUser);

      const result = await service.authenticate('valid.jwt.token');

      expect(result).toBe(testUser);
      expect(jwtService.verify).toHaveBeenCalledWith('valid.jwt.token', {
        secret: 'super-secret',
      });
    });

    it('throws USER_NOT_FOUND when JWT is valid but user no longer exists', async () => {
      configService.get.mockReturnValue('super-secret');
      jwtService.verify.mockReturnValue({ sub: 'nope' });
      usersService.findById.mockResolvedValue(null);

      await expect(service.authenticate('x')).rejects.toThrow('USER_NOT_FOUND');
    });

    it('throws INVALID_TOKEN on JWT verification failure', async () => {
      configService.get.mockReturnValue('super-secret');
      jwtService.verify.mockImplementation(() => {
        throw new Error('bad');
      });

      await expect(service.authenticate('x')).rejects.toThrow('INVALID_TOKEN');
    });

    it('throws AUTH_CONFIG_MISSING when JWT_SECRET is empty', async () => {
      configService.get.mockReturnValue(undefined);

      await expect(service.authenticate('x')).rejects.toThrow('AUTH_CONFIG_MISSING');
    });
  });
});
