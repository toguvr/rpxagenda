'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ServiceResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Card } from '@/components/Card';
import { ServiceForm, type ServiceFormValues } from '@/components/ServiceForm';

export default function NewServicePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: ServiceFormValues) {
    setBusy(true);
    setError(null);
    try {
      await api<ServiceResponse>('/services', { method: 'POST', body: values });
      router.replace('/services');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar serviço.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/services" className="text-sm text-brand-cyanDark hover:underline">
          ← serviços
        </Link>
        <h1 className="text-2xl font-bold text-brand-black mt-1">Novo serviço</h1>
      </div>
      <Card title="Configuração do serviço">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
            {error}
          </div>
        )}
        <ServiceForm
          submitLabel="Cadastrar"
          busy={busy}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/services')}
        />
      </Card>
    </div>
  );
}
