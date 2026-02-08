import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiWorkOrderController } from './ai-work-order.controller';
import { AiWorkOrderService } from './ai-work-order.service';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { UsersModule } from '../users/users.module';
import { VehiclesModule } from '../vehicles/vehicles.module';

@Module({
  imports: [WorkOrdersModule, UsersModule, VehiclesModule, ConfigModule],
  controllers: [AiWorkOrderController],
  providers: [AiWorkOrderService],
})
export class AiWorkOrderModule {}
