import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser, JwtPayload } from '../common/types';

@Injectable()
export class SocketJwtAuthService {
  private readonly logger = new Logger(SocketJwtAuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  extractToken(
    handshake: {
      auth?: { token?: string };
      query?: { token?: string };
      headers?: Record<string, string | string[] | undefined>;
    },
  ): string | null {
    if (handshake.auth?.token) {
      return handshake.auth.token;
    }
    if (handshake.query?.token) {
      return handshake.query.token;
    }
    const headers = handshake.headers;
    if (headers) {
      const authHeader = headers.authorization;
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7);
      }
    }
    return null;
  }

  async authenticate(token: string): Promise<AuthenticatedUser> {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      this.logger.error('JWT_SECRET not configured');
      throw new Error('AUTH_CONFIG_MISSING');
    }
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, { secret });
      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }
      return this.usersService.toSafeUser(user);
    } catch (error) {
      if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
        throw error;
      }
      this.logger.debug('JWT verification failed');
      throw new Error('INVALID_TOKEN');
    }
  }
}
