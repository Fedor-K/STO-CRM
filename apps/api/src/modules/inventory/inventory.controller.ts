import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray, IsBoolean, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryService } from './inventory.service';
import { Roles, CurrentTenant, CurrentUser, type CurrentUserData } from '../../common/decorators';
import { StockMovementType } from '@prisma/client';

// ===== DTOs =====

class CreateWarehouseDto {
  @IsString()
  name!: string;

  @IsOptional() @IsString()
  code?: string;

  @IsOptional() @IsString()
  address?: string;
}

class UpdateWarehouseDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  code?: string;

  @IsOptional() @IsString()
  address?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

class ReceiveItemDto {
  @IsString()
  partId!: string;

  @Type(() => Number) @IsNumber()
  quantity!: number;

  @IsOptional() @IsString()
  notes?: string;
}

class ReceiveStockDto {
  @IsString()
  warehouseId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items!: ReceiveItemDto[];

  @IsOptional() @IsString()
  reference?: string;
}

class AdjustStockDto {
  @IsString()
  partId!: string;

  @IsString()
  warehouseId!: string;

  @Type(() => Number) @IsNumber()
  newQuantity!: number;

  @IsOptional() @IsString()
  notes?: string;
}

class TransferStockDto {
  @IsString()
  partId!: string;

  @IsString()
  fromWarehouseId!: string;

  @IsString()
  toWarehouseId!: string;

  @Type(() => Number) @IsNumber()
  quantity!: number;

  @IsOptional() @IsString()
  notes?: string;
}

// ===== Controller =====

@ApiTags('Склад')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // --- Warehouses ---

  @Get('warehouses')
  @Roles('parts:read')
  @ApiOperation({ summary: 'Список складов' })
  getWarehouses(@CurrentTenant() tenantId: string) {
    return this.inventoryService.findAllWarehouses(tenantId);
  }

  @Post('warehouses')
  @Roles('parts:create')
  @ApiOperation({ summary: 'Создать склад' })
  createWarehouse(@CurrentTenant() tenantId: string, @Body() dto: CreateWarehouseDto) {
    return this.inventoryService.createWarehouse(tenantId, dto);
  }

  @Patch('warehouses/:id')
  @Roles('parts:update')
  @ApiOperation({ summary: 'Обновить склад' })
  updateWarehouse(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.inventoryService.updateWarehouse(tenantId, id, dto);
  }

  // --- Stock levels ---

  @Get('stock')
  @Roles('parts:read')
  @ApiOperation({ summary: 'Остатки по складам (развёрнуто)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  getStock(
    @CurrentTenant() tenantId: string,
    @Query() query: { page?: string; limit?: string; search?: string; warehouseId?: string; lowStock?: string },
  ) {
    return this.inventoryService.getStock(tenantId, {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 50,
      sort: 'name',
      order: 'asc',
      search: query.search,
      warehouseId: query.warehouseId,
      lowStock: query.lowStock === 'true',
    });
  }

  @Get('stock/summary')
  @Roles('parts:read')
  @ApiOperation({ summary: 'Сводка остатков по товарам' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  getStockSummary(
    @CurrentTenant() tenantId: string,
    @Query() query: { page?: string; limit?: string; search?: string; warehouseId?: string },
  ) {
    return this.inventoryService.getStockSummary(tenantId, {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 50,
      search: query.search,
      warehouseId: query.warehouseId,
    });
  }

  // --- Movements ---

  @Get('movements')
  @Roles('parts:read')
  @ApiOperation({ summary: 'Журнал движений' })
  @ApiQuery({ name: 'partId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'type', required: false })
  getMovements(
    @CurrentTenant() tenantId: string,
    @Query() query: { page?: string; limit?: string; partId?: string; warehouseId?: string; type?: StockMovementType },
  ) {
    return this.inventoryService.getMovements(tenantId, {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 50,
      partId: query.partId,
      warehouseId: query.warehouseId,
      type: query.type,
    });
  }

  // --- Operations ---

  @Post('receive')
  @Roles('parts:create')
  @ApiOperation({ summary: 'Приёмка товара' })
  receiveStock(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ReceiveStockDto,
  ) {
    return this.inventoryService.receiveStock(tenantId, { ...dto, userId: user.id });
  }

  @Post('adjust')
  @Roles('parts:update')
  @ApiOperation({ summary: 'Корректировка остатка' })
  adjustStock(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventoryService.adjustStock(tenantId, { ...dto, userId: user.id });
  }

  @Post('transfer')
  @Roles('parts:update')
  @ApiOperation({ summary: 'Перемещение между складами' })
  transferStock(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: TransferStockDto,
  ) {
    return this.inventoryService.transferStock(tenantId, { ...dto, userId: user.id });
  }
}
