/**
 * Indicadores agregados da unidade para o painel administrativo.
 * Tipo de resposta (read-only) — sem validação de entrada, por isso não há schema Zod.
 */
export interface DashboardSummary {
  /** Agendamentos de hoje (fuso da unidade), por status. */
  today: {
    total: number;
    scheduled: number;
    confirmed: number;
    checkedIn: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
  patients: {
    total: number;
    withActivePlan: number;
    newThisMonth: number;
  };
  plans: {
    active: number;
    pendingPayment: number;
    pastDue: number;
    suspended: number;
    /** Pacotes ACTIVE com validade nos próximos 30 dias. */
    expiringSoon: number;
  };
  /** Comparecimento nos últimos 30 dias. `rate` é 0..1. */
  attendance30d: {
    completed: number;
    noShow: number;
    rate: number;
  };
  /** Volume de agendamentos por dia nos últimos 7 dias (mais antigo → mais recente). */
  last7Days: { date: string; count: number }[];
  /** Agendamentos por serviço no mês corrente. */
  byService: { service: string; count: number }[];
  alerts: {
    expiringPlans: {
      id: string;
      patientId: string;
      patientName: string;
      serviceName: string;
      validUntil: string;
      remainingSessions: number | null;
    }[];
    lowBalancePlans: {
      id: string;
      patientId: string;
      patientName: string;
      serviceName: string;
      remainingSessions: number;
    }[];
  };
}
