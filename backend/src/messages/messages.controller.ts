import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { SendManualMessageDto } from './dto/send-manual-message.dto';
import { MessagesService } from './messages.service';

@ApiTags('messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query()
    query: {
      page?: number;
      limit?: number;
      search?: string;
      type?: string;
      status?: string;
      from?: string;
      to?: string;
    },
  ) {
    return this.messagesService.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.messagesService.get(user, id);
  }

  @Post()
  send(@CurrentUser() user: AuthUser, @Body() dto: SendManualMessageDto) {
    return this.messagesService.sendManual(user, dto);
  }

  @Post(':id/retry')
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.messagesService.retry(user, id);
  }
}