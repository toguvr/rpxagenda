'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { EquipmentResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Card } from '@/components/Card';
import { EquipmentForm, type EquipmentFormValues } from '@/components/EquipmentForm';

export default function NewEquipmentPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: EquipmentFormValues) {
    setBusy(true);
    setError(null);
    try {
      await api<EquipmentResponse>('/equipments', { method: 'POST', body: values });
      router.replace('/equipments');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar equipamento.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/equipments" className="text-sm text-brand-cyanDark hover:underline">
          ← equipamentos
        </Link>
        <h1 className="text-2xl font-bold text-brand-black mt-1">Novo equipamento</h1>
      </div>
      <Card title="Dados do equipamento">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
            {error}
          </div>
        )}
        <EquipmentForm
          submitLabel="Cadastrar"
          busy={busy}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/equipments')}
        />
      </Card>
    </div>
  );
}
