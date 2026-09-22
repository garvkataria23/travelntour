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
            : exception.code === 'P2003'
              ? HttpStatus.BAD_REQUEST
              : HttpStatus.INTERNAL_SERVER_ERROR;
      message =
        exception.code === 'P2002'
          ? 'A record with these details already exists'
          : exception.code === 'P2025'
            ? 'Resource not found'
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
