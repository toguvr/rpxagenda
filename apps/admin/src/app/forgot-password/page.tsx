'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { ApiError, api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email }, skipAuth: true });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao conectar com a API.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bgDark p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/logo.jpg" alt="RPX Agenda" className="h-16 w-auto object-contain" />
          <p className="mt-2 text-sm text-neutral-500">Recuperar senha</p>
        </div>

        {sent ? (
          <div className="space-y-4 text-center">
            <div className="rounded border border-green-200 bg-green-50 px-3 py-4 text-sm text-green-800">
              Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.
              Verifique sua caixa de entrada (e o spam). O link vale por 30 minutos.
            </div>
            <Link href="/login" className="text-sm text-brand-cyanDark hover:underline">
              Voltar para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-neutral-600">
              Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="input"
                placeholder="seu@email.com"
              />
            </div>

            {error && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Enviando…' : 'Enviar link'}
            </button>

            <div className="text-center">
              <Link href="/login" className="text-sm text-brand-cyanDark hover:underline">
                Voltar para o login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
