import { Controller, Get, OnApplicationShutdown, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';
import { Public } from '../common/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController implements OnApplicationShutdown {
  private redisClient?: Redis;

  constructor(private readonly prisma: PrismaService) {}

  private getRedis(): Redis {
    if (!this.redisClient) {
      this.redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        retryStrategy: (times) => Math.min(times * 100, 2000),
      });
      this.redisClient.on('error', () => {
        // Prevent uncaught connection errors from crashing the process
      });
    }
    return this.redisClient;
  }

  async onApplicationShutdown() {
    if (this.redisClient) {
      this.redisClient.disconnect();
      this.redisClient = undefined;
    }
  }

  @Public()
  @Get('live')
  live() {
    // Liveness only: answers as long as the process is serving HTTP. It deliberately does not
    // touch Postgres or Redis, because an orchestrator that restarts the process when a
    // dependency blips turns a brief Redis outage into a restart loop. Use /api/health for
    // dependency status and /api/ready to gate traffic.
    return { status: 'live', timestamp: new Date().toISOString() };
  }

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

    try {
      const pong = await this.getRedis().ping();
      checks.redis = pong === 'PONG' ? 'up' : 'down';
    } catch {
      checks.redis = 'down';
    }

    const healthy = Object.values(checks).every((v) => v === 'up');
    const result = {
      status: healthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };

    if (!healthy) {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }
}