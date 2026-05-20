'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { EquipmentResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';

export default function EquipmentsPage() {
  const [equipments, setEquipments] = useState<EquipmentResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<EquipmentResponse[]>('/equipments?includeInactive=true')
      .then(setEquipments)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Falha ao buscar equipamentos.'),
      );
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-black">Equipamentos</h1>
          <p className="text-sm text-neutral-500">
            {equipments?.length ?? 0} cadastrado{equipments?.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/equipments/new" className="btn-primary">
          Novo equipamento
        </Link>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {!equipments ? (
        <div className="text-neutral-400">Carregando…</div>
      ) : equipments.length === 0 ? (
        <div className="text-neutral-500 bg-white border border-neutral-200 rounded-lg p-8 text-center">
          Nenhum equipamento cadastrado.
        </div>
      ) : (
        <table className="table-base">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Quantidade total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {equipments.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link
                    href={`/equipments/${e.id}/edit`}
                    className="font-medium text-brand-black hover:text-brand-cyanDark"
                  >
                    {e.name}
                  </Link>
                </td>
                <td>{e.totalQuantity}</td>
                <td>
                  <span
                    className={
                      'inline-block text-xs px-2 py-0.5 rounded-full font-medium ' +
                      (e.active
                        ? 'bg-brand-cyanLight text-brand-cyanDark'
                        : 'bg-neutral-100 text-neutral-500')
                    }
                  >
                    {e.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
