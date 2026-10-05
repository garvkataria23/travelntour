import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '@prisma/client';

const ERROR_CODES: Record<string, string> = {
  P2002: 'RESOURCE_ALREADY_EXISTS',
  P2025: 'RESOURCE_NOT_FOUND',
  P2003: 'RELATED_RESOURCE_NOT_FOUND',
  P2014: 'RELATED_RESOURCE_REQUIRED',
};

/**
 * Turns Prisma's generic "A record with these details already exists" into something a
 * travel agent can act on. `meta.target` carries the constraint, e.g. "businessId_phone" or
 * "businessId_pnr_key".
 */
const DUPLICATE_FIELD_MESSAGES: Array<[RegExp, string]> = [
  [/businessId_phone/, 'Another customer already has this phone number'],
  [/businessId_pnr/, 'A booking with this PNR already exists'],
  [/businessId_invoiceNumber/, 'That invoice number has already been used'],
  [/User_email_key|^email$/, 'That email address is already registered'],
];

function duplicateFieldMessage(exception: Prisma.PrismaClientKnownRequestError): string {
  const target = (exception.meta as { target?: unknown } | undefined)?.target;
  const fields = Array.isArray(target) ? target.join(',') : String(target ?? '');
  for (const [pattern, message] of DUPLICATE_FIELD_MESSAGES) {
    if (pattern.test(fields)) return message;
  }
  return 'A record with these details already exists';
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost?: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let errors: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = exception.name;
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        message = (obj.message as string) || exception.message;
        errors = obj.errors;
        code = (obj.code as string) || exception.name;
        if (Array.isArray(obj.message)) {
          message = 'Validation failed';
          errors = obj.message;
          code = 'VALIDATION_ERROR';
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      code = ERROR_CODES[exception.code] || exception.code;
      status =
        exception.code === 'P2025'
          ? HttpStatus.NOT_FOUND
          : exception.code === 'P2002'
            ? HttpStatus.CONFLICT
            : exception.code === 'P2003' || exception.code === 'P2014'
              ? HttpStatus.BAD_REQUEST
              : HttpStatus.INTERNAL_SERVER_ERROR;
      message =
        exception.code === 'P2002'
          ? duplicateFieldMessage(exception)
          : exception.code === 'P2025'
            ? 'Resource not found'
            : exception.code === 'P2003' || exception.code === 'P2014'
              ? 'Required related resource constraint violated'
              : 'Database request failed';
    } else if (exception instanceof Error) {
      message = exception.message;
      code = exception.name || 'INTERNAL_ERROR';
      if (process.env.NODE_ENV !== 'production') {
        // keep message in dev
      } else {
        message = 'Internal server error';
        code = 'INTERNAL_ERROR';
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status} ${message}`);
    }

    const payload: Record<string, unknown> = {
      success: false,
      message,
      code,
    };
    if (errors) payload.errors = errors;
    if (process.env.NODE_ENV !== 'production' && status >= 500 && exception instanceof Error) {
      payload.debug = exception.message;
    }

    response.status(status).json(payload);
  }
}
