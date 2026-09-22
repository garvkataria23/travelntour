import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';
import { Public } from '../common/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    const checks: Record<string, string> = {
      api: 'up',
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'up';
    } catch {
      checks.database = 'down';
    }

    const client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    try {
      await client.connect();
      await client.ping();
      checks.redis = 'up';
    } catch {
      checks.redis = 'down';
    } finally {
      client.disconnect();
    }

    const healthy = Object.values(checks).every((v) => v === 'up');
    return {
      status: healthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}