import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthUser } from '../common/current-user.decorator';
import { ROLES_KEY } from '../common/roles.decorator';
import { Role } from '@prisma/client';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('public', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException({ message: 'Authentication required', code: 'UNAUTHORIZED' });

    try {
      const payload = await this.jwtService.verifyAsync(token);
      if (payload.type !== 'access') {
        throw new UnauthorizedException({ message: 'Invalid token type', code: 'INVALID_TOKEN' });
      }
      const user: AuthUser = {
        id: payload.sub,
        businessId: payload.businessId,
        email: payload.email,
        name: payload.name,
        role: payload.role,
      };
      request.user = user;
    } catch {
      throw new UnauthorizedException({ message: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    }

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && roles.length > 0) {
      const allowed = roles.includes(userSafeRole(request.user)) || request.user.role === 'SUPER_ADMIN';
      if (!allowed) {
        throw new UnauthorizedException({ message: 'Insufficient permissions', code: 'FORBIDDEN' });
      }
    }
    return true;
  }
}

function userSafeRole(user: AuthUser): Role {
  return user.role as Role;
}
