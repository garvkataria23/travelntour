import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { toPlainJson } from './decimal-json';

/**
 * Wraps every successful response in `{ success: true, data }` and normalises Prisma Decimal
 * values to JSON numbers.
 *
 * The Decimal normalisation is not cosmetic. Money columns are `Decimal(18,2)`, and Decimal.js
 * implements `toJSON()` by returning a **string**, so an untouched Decimal in a response body
 * reaches the client as `"1234.50"` instead of `1234.5`. The frontend does arithmetic and chart
 * aggregation on these values, so a stringified total silently breaks sums and comparisons in the
 * browser.
 *
 * Doing the conversion here rather than field by field means a service that returns a raw Prisma
 * row cannot leak a Decimal — there is a single choke point and no per-endpoint discipline to
 * maintain. Handlers that need Decimal semantics internally still have them; the conversion
 * happens only on the way out.
 */
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
        const plain = toPlainJson(data);
        if (plain === undefined || plain === null) return { success: true, data: plain };
        if (typeof plain === 'object' && plain !== null && 'success' in plain) return plain;
        return { success: true, data: plain };
      }),
    );
  }
}