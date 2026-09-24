import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CreateInvoiceItemDto, SetPaymentDto, UpdateInvoiceItemDto } from './dto/invoice.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query()
    query: {
      page?: number;
      limit?: number;
      search?: string;
      paymentStatus?: string;
      from?: string;
      to?: string;
      sort?: string;
      order?: 'asc' | 'desc';
    },
  ) {
    return this.invoicesService.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.get(user, id);
  }

  @Get(':id/pdf')
  getPdf(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.getPdf(user, id);
  }

  @Post(':id/issue')
  issue(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.issue(user, id);
  }

  @Post(':id/items')
  addItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateInvoiceItemDto) {
    return this.invoicesService.addItem(user, id, dto);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateInvoiceItemDto,
  ) {
    return this.invoicesService.updateItem(user, id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.invoicesService.removeItem(user, id, itemId);
  }

  @Patch(':id/payment')
  setPayment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetPaymentDto) {
    return this.invoicesService.setPayment(user, id, dto);
  }

  @Post(':id/send')
  sendViaWhatsApp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.sendViaWhatsApp(user, id);
  }
}