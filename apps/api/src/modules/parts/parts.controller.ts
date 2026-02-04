import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { PartsService } from './parts.service';
import { Roles, CurrentTenant } from '../../common/decorators';
import { PaginationDto } from '../../common/dto/pagination.dto';

class CreatePartDto {
  @IsString()
  name!: string;

  @IsOptional() @IsString()
  sku?: string;

  @IsOptional() @IsString()
  brand?: string;

  @IsOptional() @IsString()
  oemNumber?: string;

  @Type(() => Number) @IsNumber()
  costPrice!: number;

  @Type(() => Number) @IsNumber()
  sellPrice!: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  currentStock?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  minStock?: number;

  @IsOptional() @IsString()
  unit?: string;
}

class UpdatePartDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  sku?: string;

  @IsOptional() @IsString()
  brand?: string;

  @IsOptional() @IsString()
  oemNumber?: string;

  @IsOptional() @Type(() => Number) @IsNumber()
  costPrice?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  sellPrice?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  currentStock?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  minStock?: number;

  @IsOptional() @IsString()
  unit?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

@ApiTags('Запчасти')
@ApiBearerAuth()
@Controller('parts')
export class PartsController {
  constructor(private readonly partsService: PartsService) {}

  @Get()
  @Roles('parts:read')
  @ApiOperation({ summary: 'Список запчастей' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: PaginationDto & { search?: string; isActive?: string },
  ) {
    return this.partsService.findAll(tenantId, {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 20,
      sort: query.sort ?? 'name',
      order: query.order ?? 'asc',
      search: query.search,
      isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
    });
  }

  @Get(':id')
  @Roles('parts:read')
  @ApiOperation({ summary: 'Детали запчасти' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.partsService.findById(tenantId, id);
  }

  @Post()
  @Roles('parts:create')
  @ApiOperation({ summary: 'Создать запчасть' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreatePartDto) {
    return this.partsService.create(tenantId, dto);
  }

  @Patch(':id')
  @Roles('parts:update')
  @ApiOperation({ summary: 'Обновить запчасть' })
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdatePartDto) {
    return this.partsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('parts:delete')
  @ApiOperation({ summary: 'Удалить запчасть' })
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.partsService.delete(tenantId, id);
  }
}
