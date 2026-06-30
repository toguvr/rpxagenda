'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ProfessionalInviteResponse, ProfessionalResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Card } from '@/components/Card';
import { CopyButton } from '@/components/CopyButton';
import { ProfessionalForm, type ProfessionalUpdateValues } from '@/components/ProfessionalForm';

function redeemUrl(token: string): string {
  if (typeof window === 'undefined') return `/professional-invites/${token}/redeem`;
  return `${window.location.origin}/professional-invites/${token}/redeem`;
}

export default function EditProfessionalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [professional, setProfessional] = useState<ProfessionalResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<ProfessionalInviteResponse | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

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

  async function handleGenerateInvite() {
    setInviteError(null);
    setInviteBusy(true);
    try {
      const inv = await api<ProfessionalInviteResponse>(`/professionals/${id}/invites`, {
        method: 'POST',
      });
      setInvite(inv);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Falha ao gerar convite.');
    } finally {
      setInviteBusy(false);
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
    <div className="space-y-6">
      <div>
        <Link href="/professionals" className="text-sm text-brand-cyanDark hover:underline">
          ← profissionais
        </Link>
        <h1 className="text-2xl font-bold text-brand-black mt-1">
          Editar: {professional.fullName}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">{professional.email}</p>
      </div>

      <Card title="Acesso ao painel">
        {professional.hasAccess ? (
          <p className="text-sm text-neutral-600">
            <span className="mr-2 inline-block rounded-full bg-brand-cyanLight px-2 py-0.5 text-xs font-medium text-brand-cyanDark">
              Acesso ativo
            </span>
            O profissional já criou a senha e pode acessar o painel.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600">
              <span className="mr-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Convite pendente
              </span>
              Um convite foi enviado por e-mail no cadastro. Gere um novo link se precisar reenviar.
            </p>
            {inviteError && <div className="text-sm text-red-700">{inviteError}</div>}
            {invite && (
              <div className="rounded border border-neutral-200 bg-neutral-50 p-3">
                <p className="mb-1 text-xs text-neutral-500">
                  Link de criação de senha (válido até{' '}
                  {new Date(invite.expiresAt).toLocaleDateString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                  })}
                  ):
                </p>
                <div className="flex items-center gap-3">
                  <code className="min-w-0 flex-1 truncate text-xs text-brand-black">
                    {redeemUrl(invite.token)}
                  </code>
                  <CopyButton value={redeemUrl(invite.token)} />
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleGenerateInvite}
              disabled={inviteBusy}
              className="btn-outline"
            >
              {inviteBusy ? 'Gerando…' : invite ? 'Gerar novo link' : 'Gerar link de convite'}
            </button>
          </div>
        )}
      </Card>

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
