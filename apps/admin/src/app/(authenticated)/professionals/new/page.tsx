'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ProfessionalResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Card } from '@/components/Card';
import { ProfessionalForm, type ProfessionalCreateValues } from '@/components/ProfessionalForm';

export default function NewProfessionalPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate(values: ProfessionalCreateValues) {
    setBusy(true);
    setError(null);
    try {
      await api<ProfessionalResponse>('/professionals', { method: 'POST', body: values });
      router.replace('/professionals');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar profissional.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/professionals" className="text-sm text-brand-cyanDark hover:underline">
          ← profissionais
        </Link>
        <h1 className="text-2xl font-bold text-brand-black mt-1">Novo profissional</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Cria a conta de acesso (role PROFESSIONAL) junto com o cadastro.
        </p>
      </div>
      <Card title="Dados do profissional">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
            {error}
          </div>
        )}
        <ProfessionalForm
          mode="create"
          busy={busy}
          onCreate={handleCreate}
          onCancel={() => router.push('/professionals')}
        />
      </Card>
    </div>
  );
}
