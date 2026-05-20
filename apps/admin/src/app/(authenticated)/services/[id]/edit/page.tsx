'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ServiceResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Card } from '@/components/Card';
import { ServiceForm, type ServiceFormValues } from '@/components/ServiceForm';
import { BusinessHoursEditor } from '@/components/BusinessHoursEditor';

export default function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [service, setService] = useState<ServiceResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ServiceResponse>(`/services/${id}`)
      .then(setService)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : 'Falha ao carregar serviço.'),
      );
  }, [id]);

  async function handleSubmit(values: ServiceFormValues) {
    setBusy(true);
    setError(null);
    try {
      await api<ServiceResponse>(`/services/${id}`, { method: 'PATCH', body: values });
      router.replace('/services');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar serviço.');
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
  if (!service) return <div className="text-neutral-400">Carregando…</div>;

  return (
    <div>
      <div className="mb-6">
        <Link href="/services" className="text-sm text-brand-cyanDark hover:underline">
          ← serviços
        </Link>
        <h1 className="text-2xl font-bold text-brand-black mt-1">Editar: {service.name}</h1>
      </div>
      <Card title="Configuração do serviço">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
            {error}
          </div>
        )}
        <ServiceForm
          initial={service}
          submitLabel="Salvar alterações"
          busy={busy}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/services')}
        />
      </Card>

      <div className="mt-6">
        <Card title="Horários de funcionamento">
          <p className="text-sm text-neutral-500 mb-4">
            Janelas em que este serviço gera slots. O fuso é o da unidade. Pode haver várias janelas
            no mesmo dia (ex: manhã + tarde).
          </p>
          <BusinessHoursEditor serviceId={service.id} />
        </Card>
      </div>
    </div>
  );
}
