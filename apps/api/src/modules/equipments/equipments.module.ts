import { Module } from '@nestjs/common';
import { EquipmentsController } from './equipments.controller';
import { EquipmentsService } from './equipments.service';

@Module({
  controllers: [EquipmentsController],
  providers: [EquipmentsService],
  exports: [EquipmentsService],
})
export class EquipmentsModule {}
