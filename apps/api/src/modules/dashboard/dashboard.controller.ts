import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentTenant } from '../../common/decorators';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Статистика для дашборда' })
  getStats(@CurrentTenant() tenantId: string) {
    return this.service.getStats(tenantId);
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Воронка клиентов — от обращения до выдачи' })
  getClientFunnel(@CurrentTenant() tenantId: string) {
    return this.service.getClientFunnel(tenantId);
  }
}
