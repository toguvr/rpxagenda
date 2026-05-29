'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ApiError, login } from '@/lib/api';
import { saveSession } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login(email, password);
      saveSession(res.accessToken, res.refreshToken, res.user);
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Falha ao conectar com a API. Verifique se ela está rodando.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bgDark p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/logo.jpg" alt="RPX Agenda" className="h-28 w-28 object-contain" />
          <p className="mt-2 text-sm text-neutral-500">Painel administrativo</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="input"
              placeholder="admin@rpxexpert.local"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="input"
              minLength={8}
            />
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/forgot-password" className="text-sm text-brand-cyanDark hover:underline">
            Esqueci a senha
          </Link>
        </div>
      </div>
    </div>
  );
}
