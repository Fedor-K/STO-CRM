import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  IsObject,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WorkOrdersService } from './work-orders.service';
import { Roles, CurrentTenant, CurrentUser, type CurrentUserData } from '../../common/decorators';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { WorkOrderStatus, WorkOrderItemType } from '@prisma/client';

// --- DTOs ---

class CreateWorkOrderDto {
  @IsUUID()
  clientId!: string;

  @IsUUID()
  vehicleId!: string;

  @IsOptional() @IsUUID()
  advisorId?: string;

  @IsOptional() @IsUUID()
  mechanicId?: string;

  @IsOptional() @IsUUID()
  repairTypeId?: string;

  @IsOptional() @IsUUID()
  appointmentId?: string;

  @IsOptional() @IsString()
  clientComplaints?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  mileageAtIntake?: number;

  @IsOptional() @IsString()
  fuelLevel?: string;
}

class UpdateWorkOrderDto {
  @IsOptional() @IsUUID()
  mechanicId?: string;

  @IsOptional() @IsUUID()
  advisorId?: string;

  @IsOptional() @IsUUID()
  repairTypeId?: string;

  @IsOptional() @IsString()
  clientComplaints?: string;

  @IsOptional() @IsString()
  diagnosticNotes?: string;

  @IsOptional()
  @IsObject()
  inspectionChecklist?: Record<string, any>;
}

class UpdateStatusDto {
  @IsEnum(WorkOrderStatus)
  status!: WorkOrderStatus;
}

class CreateItemDto {
  @IsEnum(WorkOrderItemType)
  type!: WorkOrderItemType;

  @IsString()
  description!: string;

  @Type(() => Number) @IsNumber() @Min(0.01)
  quantity!: number;

  @Type(() => Number) @IsNumber() @Min(0)
  unitPrice!: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  normHours?: number;

  @IsOptional() @IsUUID()
  serviceId?: string;

  @IsOptional() @IsUUID()
  partId?: string;

  @IsOptional() @IsBoolean()
  recommended?: boolean;

  @IsOptional() @IsUUID()
  mechanicId?: string;
}

class UpdateItemDto {
  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01)
  quantity?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  unitPrice?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  normHours?: number;

  @IsOptional() @IsBoolean()
  approvedByClient?: boolean;
}

class AddItemMechanicDto {
  @IsUUID()
  mechanicId!: string;
}

class UpdateItemMechanicDto {
  @Type(() => Number) @IsNumber() @Min(1)
  contributionPercent!: number;
}

class CreateWorkLogDto {
  @IsString()
  description!: string;

  @Type(() => Number) @IsNumber() @Min(0.01)
  hoursWorked!: number;

  @IsOptional() @IsString()
  logDate?: string;
}

@ApiTags('Заказ-наряды')
@ApiBearerAuth()
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Get()
  @Roles('work-orders:read')
  @ApiOperation({ summary: 'Список заказ-нарядов' })
  @ApiQuery({ name: 'status', required: false, enum: WorkOrderStatus })
  @ApiQuery({ name: 'mechanicId', required: false })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: PaginationDto & {
      status?: WorkOrderStatus;
      mechanicId?: string;
      clientId?: string;
      search?: string;
    },
  ) {
    return this.workOrdersService.findAll(tenantId, {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 20,
      sort: query.sort ?? 'createdAt',
      order: query.order ?? 'desc',
      status: query.status,
      mechanicId: query.mechanicId,
      clientId: query.clientId,
      search: query.search,
    });
  }

  @Get('kanban')
  @Roles('work-orders:read')
  @ApiOperation({ summary: 'Kanban-доска заказ-нарядов' })
  getKanban(@CurrentTenant() tenantId: string) {
    return this.workOrdersService.getKanban(tenantId);
  }

  @Get('my')
  @Roles('work-orders:read')
  @ApiOperation({ summary: 'Мои заказ-наряды (механик)' })
  getMyOrders(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @Query() query: PaginationDto,
  ) {
    return this.workOrdersService.findMyOrders(tenantId, user.id, {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 20,
    });
  }

  @Get(':id')
  @Roles('work-orders:read')
  @ApiOperation({ summary: 'Детали заказ-наряда' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.workOrdersService.findById(tenantId, id);
  }

  @Post()
  @Roles('work-orders:create')
  @ApiOperation({ summary: 'Создать заказ-наряд' })
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateWorkOrderDto,
  ) {
    return this.workOrdersService.create(tenantId, dto, user.id);
  }

  @Post('from-appointment/:appointmentId')
  @Roles('work-orders:create')
  @ApiOperation({ summary: 'Создать заказ-наряд из записи' })
  createFromAppointment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @Param('appointmentId') appointmentId: string,
  ) {
    return this.workOrdersService.createFromAppointment(tenantId, appointmentId, user.id);
  }

  @Patch(':id')
  @Roles('work-orders:update')
  @ApiOperation({ summary: 'Обновить заказ-наряд' })
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: UpdateWorkOrderDto,
  ) {
    return this.workOrdersService.update(tenantId, id, dto, user.id);
  }

  @Patch(':id/status')
  @Roles('work-orders:update')
  @ApiOperation({ summary: 'Изменить статус заказ-наряда' })
  updateStatus(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.workOrdersService.updateStatus(tenantId, id, dto.status, user.id);
  }

  @Delete(':id')
  @Roles('work-orders:delete')
  @ApiOperation({ summary: 'Удалить заказ-наряд' })
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.workOrdersService.delete(tenantId, id);
  }

  // --- Items ---

  @Post(':id/items')
  @Roles('work-orders:update')
  @ApiOperation({ summary: 'Добавить позицию' })
  addItem(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: CreateItemDto,
  ) {
    return this.workOrdersService.addItem(tenantId, id, dto, user.id);
  }

  @Patch(':id/items/:itemId')
  @Roles('work-orders:update')
  @ApiOperation({ summary: 'Изменить позицию' })
  updateItem(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.workOrdersService.updateItem(tenantId, id, itemId, dto, user.id);
  }

  @Delete(':id/items/:itemId')
  @Roles('work-orders:update')
  @ApiOperation({ summary: 'Удалить позицию' })
  deleteItem(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.workOrdersService.deleteItem(tenantId, id, itemId, user.id);
  }

  // --- Item Mechanics ---

  @Post(':id/items/:itemId/mechanics')
  @Roles('work-orders:update')
  @ApiOperation({ summary: 'Добавить механика к работе' })
  addItemMechanic(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: AddItemMechanicDto,
  ) {
    return this.workOrdersService.addItemMechanic(tenantId, id, itemId, dto);
  }

  @Patch(':id/items/:itemId/mechanics/:mechanicEntryId')
  @Roles('work-orders:update')
  @ApiOperation({ summary: 'Обновить % механика' })
  updateItemMechanic(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Param('mechanicEntryId') mechanicEntryId: string,
    @Body() dto: UpdateItemMechanicDto,
  ) {
    return this.workOrdersService.updateItemMechanic(tenantId, id, itemId, mechanicEntryId, dto);
  }

  @Delete(':id/items/:itemId/mechanics/:mechanicEntryId')
  @Roles('work-orders:update')
  @ApiOperation({ summary: 'Удалить механика из работы' })
  removeItemMechanic(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Param('mechanicEntryId') mechanicEntryId: string,
  ) {
    return this.workOrdersService.removeItemMechanic(tenantId, id, itemId, mechanicEntryId);
  }

  // --- Work Logs ---

  @Post(':id/work-logs')
  @Roles('work-orders:update')
  @ApiOperation({ summary: 'Добавить лог работы' })
  addWorkLog(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: CreateWorkLogDto,
  ) {
    return this.workOrdersService.addWorkLog(tenantId, id, user.id, dto);
  }
}
