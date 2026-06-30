# Sessão — Gastos fixos (despesas recorrentes) no Financeiro

> Data: 2026-06-16

## Objetivo

Permitir cadastrar **gastos fixos** (despesas recorrentes — aluguel, salários, contas,
software) que viram despesa automaticamente todo mês. "Gastos" avulsos já existiam.

## Decisões (confirmadas com o stakeholder)

1. **Geração automática** via job mensal: o admin cadastra o gasto fixo (categoria, valor, dia do
   mês) e um job diário materializa a despesa real no dia escolhido, sem duplicar.
2. **Recorrência mensal com dia do mês (1–28)** + **valor variável**: o valor do template é o
   padrão; gastos de valor variável (ex: luz) podem ter a despesa gerada ajustada depois.

## O que foi feito

### `packages/shared`

- `finance.ts`: schemas de gasto fixo (`createRecurringExpenseRequest`, `update…`,
  `recurringExpenseResponse`, `generateRecurringExpenseResponse`). `ExpenseResponse` ganhou
  `recurringExpenseId` e `period`. `FinanceSummaryResponse` ganhou `fixedMonthlyCents`.

### `apps/api`

- **Prisma**: novo model `RecurringExpense` (category, amountCents, dayOfMonth, variableAmount,
  active, lastGeneratedPeriod, …). `Expense` ganhou `recurringExpenseId` + `period` com
  **unique `(recurringExpenseId, period)`** (idempotência: 1 geração por gasto fixo por mês; NULLs
  não conflitam, então despesas avulsas seguem livres). Migration
  `20260616120000_recurring_expenses` (aditiva) **aplicada na produção**.
- **`RecurringExpensesService`**: CRUD scoped por unidade (auditado), `generateNow` (geração sob
  demanda) e um **`@Cron(EVERY_DAY_AT_6AM)`** que, por unidade (no fuso da unidade), materializa a
  despesa quando `dia >= dayOfMonth` e o mês ainda não foi gerado (cobre execução atrasada).
  Descoberto pelo `ScheduleModule.forRoot()` já carregado (appointments).
- **Endpoints** (admin, `@Screen(FINANCE)`): `POST|GET|PATCH|DELETE /recurring-expenses`,
  `POST /recurring-expenses/:id/generate`.
- **Resumo**: `fixedMonthlyCents` = soma dos gastos fixos ativos (informativo).

### `apps/admin`

- `RecurringExpenseModal` (criar/editar): categoria, valor, dia do mês, valor variável, ativo.
- Tela Financeiro: nova aba **Gastos fixos** (listar, editar, remover, “Gerar mês” sob demanda),
  botão **Novo gasto fixo**, KPI **Custo fixo/mês**, e selo **fixo** nas despesas geradas.

## Premissas assumidas

- Dia do mês limitado a **1–28** para valer em todos os meses (sem edge de fim de mês).
- O job roda **06:00 (horário do servidor)**; a competência/dia é calculada no **fuso de cada
  unidade** (`Unit.timezone`).
- Despesa gerada usa o valor do template; para `variableAmount`, ajustar a despesa do mês depois
  (a despesa é editável). Remover um gasto fixo **mantém** as despesas já geradas (FK SetNull).

## Próximos passos sugeridos

- (Opcional) Notificar/realçar no painel quando um gasto fixo de valor variável gerou a despesa do
  mês e precisa de ajuste.
- (Opcional) Relatório de projeção: recebimentos esperados − custo fixo do mês.
