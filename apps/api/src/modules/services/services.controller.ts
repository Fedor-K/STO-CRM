import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsEnum, IsBoolean } from 'class-validator';
import { ServicesService } from './services.service';
import { Roles, CurrentTenant } from '../../common/decorators';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ServiceUsage } from '@prisma/client';

class CreateServiceDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  price!: number;

  @IsOptional()
  @IsNumber()
  estimatedMinutes?: number;

  @IsOptional()
  @IsNumber()
  normHours?: number;

  @IsOptional()
  @IsNumber()
  complexityLevel?: number;

  @IsOptional()
  @IsEnum(ServiceUsage)
  serviceUsage?: ServiceUsage;
}

class UpdateServiceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsNumber()
  estimatedMinutes?: number;

  @IsOptional()
  @IsNumber()
  normHours?: number;

  @IsOptional()
  @IsNumber()
  complexityLevel?: number;

  @IsOptional()
  @IsEnum(ServiceUsage)
  serviceUsage?: ServiceUsage;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@ApiTags('Услуги')
@ApiBearerAuth()
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @Roles('services:read')
  @ApiOperation({ summary: 'Список услуг' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'usage', required: false, enum: ServiceUsage })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: PaginationDto & { search?: string; usage?: ServiceUsage; isActive?: string },
  ) {
    return this.servicesService.findAll(tenantId, {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 20,
      sort: query.sort ?? 'createdAt',
      order: query.order ?? 'desc',
      search: query.search,
      usage: query.usage,
      isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
    });
  }

  @Get(':id')
  @Roles('services:read')
  @ApiOperation({ summary: 'Детали услуги' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.servicesService.findById(tenantId, id);
  }

  @Post()
  @Roles('services:create')
  @ApiOperation({ summary: 'Создать услугу' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateServiceDto) {
    return this.servicesService.create(tenantId, dto);
  }

  @Patch(':id')
  @Roles('services:update')
  @ApiOperation({ summary: 'Обновить услугу' })
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('services:delete')
  @ApiOperation({ summary: 'Удалить услугу' })
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.servicesService.delete(tenantId, id);
  }
}
