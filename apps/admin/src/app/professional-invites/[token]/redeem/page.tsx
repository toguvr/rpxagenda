'use client';

import { use, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { SCREENS, type LoginResponse, type ProfessionalInviteLookupResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { saveSession } from '@/lib/auth';

/**
 * Página pública de resgate do convite do profissional: ele define a própria
 * senha e entra direto no painel. Endpoints `/professional-invites/:token` e
 * `/professional-invites/:token/redeem` são públicos.
 */
export default function RedeemProfessionalInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [lookup, setLookup] = useState<ProfessionalInviteLookupResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<ProfessionalInviteLookupResponse>(`/professional-invites/${token}`, { skipAuth: true })
      .then(setLookup)
      .catch((err) =>
        setLoadError(
          err instanceof ApiError ? err.message : 'Convite inválido, expirado ou já utilizado.',
        ),
      );
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('A senha deve ter ao menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    setLoading(true);
    try {
      const res = await api<LoginResponse>(`/professional-invites/${token}/redeem`, {
        method: 'POST',
        body: { password },
        skipAuth: true,
      });
      saveSession(res.accessToken, res.refreshToken, res.user);
      // Entra direto na primeira tela permitida (pode não ter o Painel).
      const first = SCREENS.find((s) => res.user.permissions.includes(s.key));
      router.replace(first?.path ?? '/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar a senha.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bgDark p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded bg-brand-cyan flex items-center justify-center">
            <span className="text-white font-bold text-xl">R</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-brand-black">RPX Agenda</h1>
            <p className="text-sm text-neutral-500">Criar acesso ao painel</p>
          </div>
        </div>

        {loadError ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {loadError}
          </div>
        ) : !lookup ? (
          <div className="text-neutral-400 text-sm">Carregando convite…</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-neutral-600">
              Olá, <strong>{lookup.professional.fullName}</strong>. Defina sua senha de acesso
              (e-mail {lookup.professional.email}).
            </p>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Confirmar senha
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
                className="input"
              />
            </div>

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Criando…' : 'Criar senha e entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
