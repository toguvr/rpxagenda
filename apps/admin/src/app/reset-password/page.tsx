'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ApiError, api } from '@/lib/api';

export default function ResetPasswordPage() {
  const router = useRouter();
  // undefined = ainda lendo a URL; '' = sem token; string = token presente.
  const [token, setToken] = useState<string | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    setToken(t ?? '');
  }, []);

  const canSubmit = !loading && password.length >= 8 && password === confirm && !!token;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: { token, password },
        skipAuth: true,
      });
      setDone(true);
      setTimeout(() => router.replace('/login'), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao redefinir a senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bgDark p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/logo.jpg" alt="RPX Agenda" className="h-28 w-28 object-contain" />
          <p className="mt-2 text-sm text-neutral-500">Redefinir senha</p>
        </div>

        {token === undefined ? (
          <div className="text-center text-neutral-400">Carregando…</div>
        ) : token === '' ? (
          <div className="space-y-4 text-center">
            <div className="rounded border border-red-200 bg-red-50 px-3 py-4 text-sm text-red-700">
              Link inválido. Solicite um novo link de redefinição.
            </div>
            <Link href="/forgot-password" className="text-sm text-brand-cyanDark hover:underline">
              Solicitar novo link
            </Link>
          </div>
        ) : done ? (
          <div className="space-y-4 text-center">
            <div className="rounded border border-green-200 bg-green-50 px-3 py-4 text-sm text-green-800">
              Senha redefinida com sucesso! Redirecionando para o login…
            </div>
            <Link href="/login" className="text-sm text-brand-cyanDark hover:underline">
              Ir para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Nova senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                className="input"
                placeholder="mínimo 8 caracteres"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Confirmar senha
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                className="input"
              />
            </div>

            {error && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button type="submit" disabled={!canSubmit} className="btn-primary w-full">
              {loading ? 'Salvando…' : 'Redefinir senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
