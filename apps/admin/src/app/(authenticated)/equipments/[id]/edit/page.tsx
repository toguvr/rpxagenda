'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { EquipmentResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Card } from '@/components/Card';
import { EquipmentForm, type EquipmentFormValues } from '@/components/EquipmentForm';

export default function EditEquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [equipment, setEquipment] = useState<EquipmentResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<EquipmentResponse>(`/equipments/${id}`)
      .then(setEquipment)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : 'Falha ao carregar equipamento.'),
      );
  }, [id]);

  async function handleSubmit(values: EquipmentFormValues) {
    setBusy(true);
    setError(null);
    try {
      await api<EquipmentResponse>(`/equipments/${id}`, { method: 'PATCH', body: values });
      router.replace('/equipments');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar equipamento.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
        {loadError}
      </div>
    );
  }
  if (!equipment) return <div className="text-neutral-400">Carregando…</div>;

  return (
    <div>
      <div className="mb-6">
        <Link href="/equipments" className="text-sm text-brand-cyanDark hover:underline">
          ← equipamentos
        </Link>
        <h1 className="text-2xl font-bold text-brand-black mt-1">Editar: {equipment.name}</h1>
      </div>
      <Card title="Dados do equipamento">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
            {error}
          </div>
        )}
        <EquipmentForm
          initial={equipment}
          submitLabel="Salvar alterações"
          busy={busy}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/equipments')}
        />
      </Card>
    </div>
  );
}
