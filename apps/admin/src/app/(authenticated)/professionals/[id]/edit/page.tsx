'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ProfessionalResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Card } from '@/components/Card';
import { ProfessionalForm, type ProfessionalUpdateValues } from '@/components/ProfessionalForm';

export default function EditProfessionalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [professional, setProfessional] = useState<ProfessionalResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ProfessionalResponse>(`/professionals/${id}`)
      .then(setProfessional)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : 'Falha ao carregar profissional.'),
      );
  }, [id]);

  async function handleUpdate(values: ProfessionalUpdateValues) {
    setBusy(true);
    setError(null);
    try {
      await api<ProfessionalResponse>(`/professionals/${id}`, {
        method: 'PATCH',
        body: values,
      });
      router.replace('/professionals');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar profissional.');
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
  if (!professional) return <div className="text-neutral-400">Carregando…</div>;

  return (
    <div>
      <div className="mb-6">
        <Link href="/professionals" className="text-sm text-brand-cyanDark hover:underline">
          ← profissionais
        </Link>
        <h1 className="text-2xl font-bold text-brand-black mt-1">
          Editar: {professional.fullName}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">{professional.email}</p>
      </div>
      <Card title="Dados do profissional">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
            {error}
          </div>
        )}
        <ProfessionalForm
          mode="edit"
          initial={professional}
          busy={busy}
          onUpdate={handleUpdate}
          onCancel={() => router.push('/professionals')}
        />
      </Card>
    </div>
  );
}
