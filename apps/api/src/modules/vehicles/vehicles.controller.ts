import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { Roles, CurrentTenant } from '../../common/decorators';
import { PaginationDto } from '../../common/dto/pagination.dto';

class CreateVehicleDto {
  make!: string;
  model!: string;
  year?: number;
  vin?: string;
  licensePlate?: string;
  color?: string;
  mileage?: number;
  clientId!: string;
}

class UpdateVehicleDto {
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  licensePlate?: string;
  color?: string;
  mileage?: number;
}

@ApiTags('Автомобили')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @Roles('vehicles:read')
  @ApiOperation({ summary: 'Список автомобилей' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'clientId', required: false })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: PaginationDto & { search?: string; clientId?: string },
  ) {
    return this.vehiclesService.findAll(tenantId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sort: query.sort ?? 'createdAt',
      order: query.order ?? 'desc',
      search: query.search,
      clientId: query.clientId,
    });
  }

  @Get(':id')
  @Roles('vehicles:read')
  @ApiOperation({ summary: 'Детали автомобиля' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.vehiclesService.findById(tenantId, id);
  }

  @Post()
  @Roles('vehicles:create')
  @ApiOperation({ summary: 'Добавить автомобиль' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(tenantId, dto);
  }

  @Patch(':id')
  @Roles('vehicles:update')
  @ApiOperation({ summary: 'Обновить автомобиль' })
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehiclesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('vehicles:delete')
  @ApiOperation({ summary: 'Удалить автомобиль' })
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.vehiclesService.delete(tenantId, id);
  }
}
