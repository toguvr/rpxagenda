import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdfaceModule } from '../integrations/idface/idface.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [AuthModule, IdfaceModule],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
