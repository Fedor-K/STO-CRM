import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ServiceBaysService } from './service-bays.service';
import { Roles, CurrentTenant } from '../../common/decorators';
import { PaginationDto } from '../../common/dto/pagination.dto';

class CreateServiceBayDto {
  name!: string;
  type?: string;
}

class UpdateServiceBayDto {
  name?: string;
  type?: string;
  isActive?: boolean;
}

@ApiTags('Рабочие посты')
@ApiBearerAuth()
@Controller('service-bays')
export class ServiceBaysController {
  constructor(private readonly serviceBaysService: ServiceBaysService) {}

  @Get()
  @Roles('services:read')
  @ApiOperation({ summary: 'Список рабочих постов' })
  findAll(@CurrentTenant() tenantId: string, @Query() query: PaginationDto & { isActive?: string }) {
    return this.serviceBaysService.findAll(tenantId, {
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      sort: query.sort ?? 'name',
      order: query.order ?? 'asc',
      isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
    });
  }

  @Get(':id')
  @Roles('services:read')
  @ApiOperation({ summary: 'Детали рабочего поста' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.serviceBaysService.findById(tenantId, id);
  }

  @Post()
  @Roles('services:create')
  @ApiOperation({ summary: 'Создать рабочий пост' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateServiceBayDto) {
    return this.serviceBaysService.create(tenantId, dto);
  }

  @Patch(':id')
  @Roles('services:update')
  @ApiOperation({ summary: 'Обновить рабочий пост' })
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateServiceBayDto) {
    return this.serviceBaysService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('services:delete')
  @ApiOperation({ summary: 'Удалить рабочий пост' })
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.serviceBaysService.delete(tenantId, id);
  }
}
