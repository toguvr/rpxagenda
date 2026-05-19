import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../../appointments/appointments.module';
import { IdfaceController } from './idface.controller';
import { IdfaceService } from './idface.service';
import { IdfaceWebhookGuard } from './idface-webhook.guard';

@Module({
  imports: [AppointmentsModule],
  controllers: [IdfaceController],
  providers: [IdfaceService, IdfaceWebhookGuard],
  exports: [IdfaceService],
})
export class IdfaceModule {}
