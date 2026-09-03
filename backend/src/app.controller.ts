import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';
import { RedisService } from './redis/redis.service';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('health')
  async health(): Promise<{ status: string; postgres: string; redis: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    const redisStatus = await this.redis.ping();

    return {
      status: 'ok',
      postgres: 'up',
      redis: redisStatus === 'PONG' ? 'up' : 'down',
    };
  }
}
