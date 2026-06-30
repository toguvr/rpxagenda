import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { RecurringExpensesService } from './recurring-expenses.service';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, RecurringExpensesService],
  exports: [FinanceService, RecurringExpensesService],
})
export class FinanceModule {}
