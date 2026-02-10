import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsArray, IsNumber, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Roles, CurrentTenant, CurrentUser, type CurrentUserData } from '../../common/decorators';
import { AiWorkOrderService } from './ai-work-order.service';
import { SpravochnikService } from './spravochnik.service';

// --- DTOs ---

class ParseDto {
  @IsString()
  description!: string;
}

class ServiceItemDto {
  @IsUUID()
  serviceId!: string;

  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  normHours?: number;
}

class PartItemDto {
  @IsUUID()
  partId!: string;

  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  sellPrice!: number;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity!: number;
}

class NewClientDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

class NewVehicleDto {
  @IsString()
  make!: string;

  @IsString()
  model!: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  year?: number;

  @IsOptional()
  @IsString()
  licensePlate?: string;

  @IsOptional()
  @IsString()
  vin?: string;
}

class CreateFromAiDto {
  @IsOptional()
  @IsUUID()
  existingClientId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewClientDto)
  newClient?: NewClientDto;

  @IsOptional()
  @IsUUID()
  existingVehicleId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewVehicleDto)
  newVehicle?: NewVehicleDto;

  @IsString()
  clientComplaints!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceItemDto)
  services!: ServiceItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartItemDto)
  parts!: PartItemDto[];

  @IsOptional()
  @IsUUID()
  mechanicId?: string;
}

class AdjustVehicleDto {
  @IsString()
  make!: string;

  @IsString()
  model!: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  year?: number;
}

class AdjustCurrentServiceDto {
  @IsUUID()
  serviceId!: string;

  @IsString()
  name!: string;
}

class AdjustCurrentPartDto {
  @IsUUID()
  partId!: string;

  @IsString()
  name!: string;
}

class AdjustDto {
  @ValidateNested()
  @Type(() => AdjustVehicleDto)
  vehicle!: AdjustVehicleDto;

  @IsString()
  complaint!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdjustCurrentServiceDto)
  currentServices!: AdjustCurrentServiceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdjustCurrentPartDto)
  currentParts!: AdjustCurrentPartDto[];
}

// --- Controller ---

@ApiTags('AI Work Order')
@ApiBearerAuth()
@Controller('ai-work-order')
export class AiWorkOrderController {
  constructor(
    private readonly aiWorkOrderService: AiWorkOrderService,
    private readonly spravochnikService: SpravochnikService,
  ) {}

  @Post('parse')
  @Roles('work-orders:create')
  @ApiOperation({ summary: 'Анализ текста для создания заказ-наряда с помощью AI' })
  async parse(
    @CurrentTenant() tenantId: string,
    @Body() dto: ParseDto,
  ) {
    return this.aiWorkOrderService.parse(tenantId, dto.description);
  }

  @Post('create')
  @Roles('work-orders:create')
  @ApiOperation({ summary: 'Создание заказ-наряда из AI-превью' })
  async create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateFromAiDto,
  ) {
    return this.aiWorkOrderService.create(tenantId, dto, user.id);
  }

  @Post('adjust')
  @Roles('work-orders:create')
  @ApiOperation({ summary: 'Корректировка услуг/запчастей при смене автомобиля' })
  async adjust(
    @CurrentTenant() tenantId: string,
    @Body() dto: AdjustDto,
  ) {
    return this.aiWorkOrderService.adjust(tenantId, dto);
  }

  @Get('recommendations')
  @Roles('work-orders:create')
  @ApiOperation({ summary: 'Рекомендации из справочника по марке+модели+услугам' })
  async recommendations(
    @CurrentTenant() tenantId: string,
    @Query('make') make: string,
    @Query('model') model: string,
    @Query('services') services: string,
  ) {
    if (!make || !model || !services) {
      return { services: [] };
    }
    const serviceDescriptions = services.split(',').map(s => s.trim()).filter(Boolean);
    return this.spravochnikService.getRecommendations(tenantId, make, model, serviceDescriptions);
  }

  @Post('spravochnik/refresh')
  @Roles('work-orders:create')
  @ApiOperation({ summary: 'Принудительное обновление справочника для текущего тенанта' })
  async refreshSpravochnik(
    @CurrentTenant() tenantId: string,
  ) {
    const result = await this.spravochnikService.refreshTenant(tenantId);
    return { message: `Справочник обновлён: ${result.rowsInserted} записей`, ...result };
  }
}
