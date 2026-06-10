import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../../appointments/appointments.module';
import { IdfaceController } from './idface.controller';
import { IdfaceService } from './idface.service';
import { IdfaceWebhookGuard } from './idface-webhook.guard';
import { IdfaceDevicesController } from './idface-devices.controller';
import { IdfaceDevicesService } from './idface-devices.service';
import { IdfaceEnrollmentsService } from './idface-enrollments.service';
import { IdfacePushController } from './idface-push.controller';
import { IdfacePushRootController } from './idface-push-root.controller';
import { IdfaceFallbackController } from './idface-fallback.controller';

@Module({
  imports: [AppointmentsModule],
  controllers: [
    IdfaceController,
    IdfaceDevicesController,
    IdfacePushController,
    IdfacePushRootController,
    // POR ÚLTIMO: wildcard que pega qualquer .fcgi sob /webhooks/idface ainda
    // sem handler explícito (keepalive do modo online) — não deve atropelar os
    // handlers acima, que são registrados antes.
    IdfaceFallbackController,
  ],
  providers: [
    IdfaceService,
    IdfaceWebhookGuard,
    IdfaceDevicesService,
    IdfaceEnrollmentsService,
    // Também provider (além de controller) para poder ser injetado no
    // IdfacePushRootController, que apenas delega os aliases de raiz /push e /result.
    IdfacePushController,
  ],
  exports: [IdfaceService, IdfaceEnrollmentsService],
})
export class IdfaceModule {}
