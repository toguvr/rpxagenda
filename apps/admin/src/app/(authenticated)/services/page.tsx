'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ServiceResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ServiceResponse[]>('/services?includeInactive=true')
      .then(setServices)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Falha ao buscar serviços.'),
      );
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold text-brand-black">Serviços</h1>
          <p className="text-sm text-neutral-500">
            {services?.length ?? 0} cadastrado{services?.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/services/new" className="btn-primary whitespace-nowrap text-center">
          Novo serviço
        </Link>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {!services ? (
        <div className="text-neutral-400">Carregando…</div>
      ) : services.length === 0 ? (
        <div className="text-neutral-500 bg-white border border-neutral-200 rounded-lg p-8 text-center">
          Nenhum serviço cadastrado.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Duração</th>
                <th>Capacidade</th>
                <th>Plano</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link
                      href={`/services/${s.id}/edit`}
                      className="font-medium text-brand-black hover:text-brand-cyanDark"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td>{s.type}</td>
                  <td>{s.durationMinutes} min</td>
                  <td>{s.slotCapacity}</td>
                  <td>{s.acceptedPlanType}</td>
                  <td>
                    <span
                      className={
                        'inline-block text-xs px-2 py-0.5 rounded-full font-medium ' +
                        (s.active
                          ? 'bg-brand-cyanLight text-brand-cyanDark'
                          : 'bg-neutral-100 text-neutral-500')
                      }
                    >
                      {s.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
