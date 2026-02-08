import { Module, forwardRef } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { WorkOrdersModule } from '../work-orders/work-orders.module';

@Module({
  imports: [forwardRef(() => WorkOrdersModule)],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
