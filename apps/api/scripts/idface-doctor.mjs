/**
 * iDFace Doctor — diagnóstico rápido do totem em produção.
 *
 * Uso (de dentro de apps/api):
 *   node scripts/idface-doctor.mjs
 *
 * Mostra, sem efeitos colaterais:
 *   - se o endpoint /push está no ar (GET com deviceId fake — não consome fila);
 *   - se o totem está ONLINE no canal de push (lastSeenAt avançando);
 *   - status dos cadastros biométricos (enrollments);
 *   - se a VALIDAÇÃO DE ACESSO ONLINE está chegando (IdfaceEvent nas últimas 24h).
 *
 * Lê o DATABASE_URL do apps/api/.env (produção).
 */
import { PrismaClient } from '@prisma/client';

const BASE = process.env.IDFACE_BASE_URL ?? 'https://rpxagenda.togu.dev/webhooks/idface';
const p = new PrismaClient();

function line(label, value) {
  console.log(`  ${label.padEnd(26)} ${value}`);
}

try {
  console.log('\n=== iDFace Doctor ===');

  // 1. Endpoint /push no ar? (deviceId fake => {} sem consumir comando)
  let pushStatus = 'erro';
  try {
    const r = await fetch(`${BASE}/push?deviceId=__doctor__&uuid=doctor`, { method: 'GET' });
    pushStatus = `HTTP ${r.status}`;
  } catch (e) {
    pushStatus = `falhou (${e.message})`;
  }
  console.log('\n[Endpoint]');
  line('GET /push (device fake)', pushStatus + ' (esperado 200)');

  // 2. Device + canal de push online?
  console.log('\n[Totem / canal push]');
  const dev = await p.idfaceDevice.findFirst();
  if (!dev) {
    line('device', 'NENHUM device cadastrado');
  } else {
    const ageSec = dev.lastSeenAt ? Math.round((Date.now() - dev.lastSeenAt.getTime()) / 1000) : null;
    line('deviceId', dev.deviceId);
    line('active', String(dev.active));
    line('lastSeenAt', dev.lastSeenAt ? `${dev.lastSeenAt.toISOString()} (${ageSec}s atrás)` : 'nunca');
    const online = ageSec !== null && ageSec < 60;
    line('push', online ? 'ONLINE (pollando nos últimos 60s)' : 'SEM POLL recente — verificar rede/DNS do totem');
  }

  // 3. Enrollments (cadastro de rosto)
  console.log('\n[Cadastros biométricos]');
  const grouped = await p.idfaceEnrollment.groupBy({ by: ['status'], _count: { _all: true } });
  if (grouped.length === 0) line('enrollments', 'nenhum');
  for (const g of grouped) line(g.status, String(g._count._all));

  // 4. Validação de acesso online (IdfaceEvent) — é o que libera a porta
  console.log('\n[Acesso online (liberação da porta)]');
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const events = await p.idfaceEvent.findMany({
    where: { eventAt: { gte: since } },
    orderBy: { eventAt: 'desc' },
    take: 10,
    include: { patient: { select: { fullName: true } } },
  });
  line('IdfaceEvents (24h)', String(events.length));
  if (events.length === 0) {
    console.log('  >> 0 eventos = o totem NÃO está enviando identificação online ao servidor.');
    console.log('     Falta ativar a VALIDAÇÃO ONLINE no menu de Acesso do equipamento.');
  } else {
    for (const e of events) {
      line(
        e.eventAt.toISOString().slice(11, 19),
        `${e.accessGranted ? 'LIBEROU' : 'negou '} | ${e.outcome} | ${e.patient?.fullName ?? e.idfaceUserId}`,
      );
    }
  }
  console.log('');
} finally {
  await p.$disconnect();
}
