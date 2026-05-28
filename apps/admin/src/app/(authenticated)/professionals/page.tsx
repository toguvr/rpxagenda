'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ProfessionalResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';

export default function ProfessionalsPage() {
  const [professionals, setProfessionals] = useState<ProfessionalResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ProfessionalResponse[]>('/professionals?includeInactive=true')
      .then(setProfessionals)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Falha ao buscar profissionais.'),
      );
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold text-brand-black">Profissionais</h1>
          <p className="text-sm text-neutral-500">
            {professionals?.length ?? 0} cadastrado{professionals?.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/professionals/new" className="btn-primary whitespace-nowrap text-center">
          Novo profissional
        </Link>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {!professionals ? (
        <div className="text-neutral-400">Carregando…</div>
      ) : professionals.length === 0 ? (
        <div className="text-neutral-500 bg-white border border-neutral-200 rounded-lg p-8 text-center">
          Nenhum profissional cadastrado.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Registro</th>
                <th>E-mail</th>
                <th>Serviços</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {professionals.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link
                      href={`/professionals/${p.id}/edit`}
                      className="font-medium text-brand-black hover:text-brand-cyanDark"
                    >
                      {p.fullName}
                    </Link>
                  </td>
                  <td className="text-xs font-mono">{p.registry}</td>
                  <td className="text-neutral-500">{p.email}</td>
                  <td>{p.serviceIds.length}</td>
                  <td>
                    <span
                      className={
                        'inline-block text-xs px-2 py-0.5 rounded-full font-medium ' +
                        (p.active
                          ? 'bg-brand-cyanLight text-brand-cyanDark'
                          : 'bg-neutral-100 text-neutral-500')
                      }
                    >
                      {p.active ? 'Ativo' : 'Inativo'}
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
