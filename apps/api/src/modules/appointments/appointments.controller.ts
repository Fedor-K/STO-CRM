import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { Roles, CurrentTenant } from '../../common/decorators';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { AppointmentStatus } from '@prisma/client';

class CreateAppointmentDto {
  clientId!: string;
  vehicleId!: string;
  scheduledStart!: string;
  scheduledEnd!: string;
  advisorId?: string;
  serviceBayId?: string;
  source?: string;
  adChannel?: string;
  notes?: string;
}

class UpdateAppointmentDto {
  scheduledStart?: string;
  scheduledEnd?: string;
  advisorId?: string;
  serviceBayId?: string;
  source?: string;
  adChannel?: string;
  notes?: string;
  status?: AppointmentStatus;
}

@ApiTags('Записи')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @Roles('appointments:read')
  @ApiOperation({ summary: 'Список записей' })
  @ApiQuery({ name: 'status', required: false, enum: AppointmentStatus })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date' })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: PaginationDto & { status?: AppointmentStatus; clientId?: string; from?: string; to?: string },
  ) {
    return this.appointmentsService.findAll(tenantId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sort: query.sort ?? 'scheduledStart',
      order: query.order ?? 'asc',
      status: query.status,
      clientId: query.clientId,
      from: query.from,
      to: query.to,
    });
  }

  @Get('available-slots')
  @Roles('appointments:read')
  @ApiOperation({ summary: 'Свободные слоты' })
  @ApiQuery({ name: 'date', required: true, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'durationMinutes', required: true })
  @ApiQuery({ name: 'serviceBayId', required: false })
  getAvailableSlots(
    @CurrentTenant() tenantId: string,
    @Query() query: { date: string; durationMinutes: string; serviceBayId?: string },
  ) {
    return this.appointmentsService.getAvailableSlots(tenantId, {
      date: query.date,
      durationMinutes: Number(query.durationMinutes) || 60,
      serviceBayId: query.serviceBayId,
    });
  }

  @Get('calendar')
  @Roles('appointments:read')
  @ApiOperation({ summary: 'События календаря' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getCalendarEvents(
    @CurrentTenant() tenantId: string,
    @Query() query: { from: string; to: string },
  ) {
    return this.appointmentsService.getCalendarEvents(tenantId, {
      from: query.from,
      to: query.to,
    });
  }

  @Get(':id')
  @Roles('appointments:read')
  @ApiOperation({ summary: 'Детали записи' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.appointmentsService.findById(tenantId, id);
  }

  @Post()
  @Roles('appointments:create')
  @ApiOperation({ summary: 'Создать запись' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(tenantId, dto);
  }

  @Patch(':id')
  @Roles('appointments:update')
  @ApiOperation({ summary: 'Обновить запись' })
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.appointmentsService.update(tenantId, id, dto);
  }

  @Patch(':id/status')
  @Roles('appointments:update')
  @ApiOperation({ summary: 'Изменить статус записи' })
  updateStatus(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: { status: AppointmentStatus },
  ) {
    return this.appointmentsService.updateStatus(tenantId, id, dto.status);
  }

  @Delete(':id')
  @Roles('appointments:delete')
  @ApiOperation({ summary: 'Удалить запись' })
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.appointmentsService.delete(tenantId, id);
  }
}
