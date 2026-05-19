'use client';

import { useEffect, useState } from 'react';
import type { PatientResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';

export default function PatientsPage() {
  const [patients, setPatients] = useState<PatientResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const list = await api<PatientResponse[]>('/patients');
        setPatients(list);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Falha ao buscar pacientes.');
      }
    })();
  }, []);

  const filtered = patients?.filter((p) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      p.fullName.toLowerCase().includes(q) ||
      p.cpf.includes(q.replace(/\D/g, '')) ||
      (p.email ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-black">Pacientes</h1>
          <p className="text-sm text-neutral-500">
            {patients?.length ?? 0} cadastrado{patients?.length !== 1 ? 's' : ''}
          </p>
        </div>
        <input
          type="search"
          placeholder="Buscar por nome, CPF ou e-mail…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input max-w-sm"
        />
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {!patients ? (
        <div className="text-neutral-400">Carregando…</div>
      ) : filtered && filtered.length === 0 ? (
        <div className="text-neutral-500 bg-white border border-neutral-200 rounded-lg p-8 text-center">
          Nenhum paciente encontrado.
        </div>
      ) : (
        <table className="table-base">
          <thead>
            <tr>
              <th>Nome</th>
              <th>CPF</th>
              <th>Telefone</th>
              <th>E-mail</th>
              <th>Acesso</th>
              <th>iDFace</th>
            </tr>
          </thead>
          <tbody>
            {filtered?.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.fullName}</td>
                <td className="font-mono text-xs">{formatCpf(p.cpf)}</td>
                <td>{p.phone}</td>
                <td className="text-neutral-500">{p.email ?? '—'}</td>
                <td>
                  <Badge ok={p.hasUserAccount}>
                    {p.hasUserAccount ? 'Cadastrado' : 'Pendente'}
                  </Badge>
                </td>
                <td>
                  <Badge ok={p.hasIdfaceEnrolled}>{p.hasIdfaceEnrolled ? 'Sim' : 'Não'}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={
        'inline-block text-xs px-2 py-0.5 rounded-full font-medium ' +
        (ok ? 'bg-brand-cyanLight text-brand-cyanDark' : 'bg-neutral-100 text-neutral-500')
      }
    >
      {children}
    </span>
  );
}

function formatCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
