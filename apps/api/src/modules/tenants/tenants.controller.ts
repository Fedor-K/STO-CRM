import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { Roles } from '../../common/decorators';
import { PaginationDto } from '../../common/dto/pagination.dto';

class CreateTenantDto {
  name!: string;
  slug!: string;
  plan?: string;
  settings?: any;
}

class UpdateTenantDto {
  name?: string;
  slug?: string;
  plan?: string;
  settings?: any;
  isActive?: boolean;
}

@ApiTags('Платформа — Тенанты')
@ApiBearerAuth()
@Roles('tenants:create')
@Controller('platform/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles('tenants:read')
  @ApiOperation({ summary: 'Список автосервисов' })
  findAll(@Query() query: PaginationDto) {
    return this.tenantsService.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sort: query.sort ?? 'createdAt',
      order: query.order ?? 'desc',
    });
  }

  @Get(':id')
  @Roles('tenants:read')
  @ApiOperation({ summary: 'Детали автосервиса' })
  findOne(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  @Post()
  @Roles('tenants:create')
  @ApiOperation({ summary: 'Создать автосервис' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Patch(':id')
  @Roles('tenants:update')
  @ApiOperation({ summary: 'Обновить автосервис' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('tenants:delete')
  @ApiOperation({ summary: 'Удалить автосервис' })
  remove(@Param('id') id: string) {
    return this.tenantsService.delete(id);
  }
}
