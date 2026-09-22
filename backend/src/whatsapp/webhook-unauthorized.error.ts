import { HttpException, HttpStatus } from '@nestjs/common';

export class UnauthorizedWebhookError extends HttpException {
  constructor() {
    super('Verification failed', HttpStatus.FORBIDDEN);
  }
}