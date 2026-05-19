import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { NoShowService } from './no-show.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, NoShowService],
  exports: [AppointmentsService, NoShowService],
})
export class AppointmentsModule {}
