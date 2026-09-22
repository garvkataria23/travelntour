import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest();
      if (request.method === 'GET' && request.url.includes('/swagger')) {
        return next.handle();
      }
    }
    return next.handle().pipe(
      map((data) => {
        if (data === undefined || data === null) return { success: true, data };
        if (typeof data === 'object' && data !== null && 'success' in data) return data;
        return { success: true, data };
      }),
    );
  }
}
