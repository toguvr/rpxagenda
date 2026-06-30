'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { SCREENS, effectiveScreens, screenForPath, type AuthenticatedUser } from '@rpx/shared';
import { getCurrentUser, isAuthenticated } from '@/lib/auth';
import { logoutApi } from '@/lib/api';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    setUser(getCurrentUser());
    setReady(true);
  }, [router]);

  // Telas liberadas para este usuário (ADMIN = todas).
  const allowed = useMemo(() => {
    if (!user) return new Set<string>();
    return new Set<string>(effectiveScreens(user.role, user.permissions));
  }, [user]);

  const nav = useMemo(() => SCREENS.filter((s) => allowed.has(s.key)), [allowed]);

  // Guarda de rota: se a tela atual não está liberada, manda para a primeira
  // tela permitida (ou deixa cair no estado "sem acesso" abaixo).
  useEffect(() => {
    if (!ready || !user || !pathname) return;
    const screen = screenForPath(pathname);
    if (screen && !allowed.has(screen.key)) {
      const first = SCREENS.find((s) => allowed.has(s.key));
      if (first) router.replace(first.path);
    }
  }, [ready, user, pathname, allowed, router]);

  // Fecha o drawer ao trocar de rota (mobile)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-400">Carregando…</div>
    );
  }

  async function handleLogout() {
    await logoutApi();
    router.replace('/login');
  }

  return (
    <div className="flex h-screen bg-neutral-50">
      {/* Backdrop (mobile, com drawer aberto) */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar — drawer no mobile, fixa no desktop */}
      <aside
        className={
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand-bgDark text-white transition-transform duration-200 md:static md:z-auto md:w-60 md:translate-x-0 ' +
          (open ? 'translate-x-0' : '-translate-x-full')
        }
      >
        <div className="flex items-center justify-between border-b border-neutral-800 p-6">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/logo.jpg"
              alt="RPX Agenda"
              className="h-9 w-auto rounded bg-white object-contain px-1.5 py-1"
            />
            <div className="truncate text-xs text-neutral-400">{user?.fullName ?? user?.email}</div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-neutral-400 hover:text-white md:hidden"
            aria-label="Fechar menu"
          >
            <CloseIcon />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {nav.map((item) => {
            const active = pathname === item.path || pathname?.startsWith(`${item.path}/`);
            return (
              <Link
                key={item.key}
                href={item.path}
                className={
                  'block rounded px-3 py-2 text-sm font-medium transition-colors ' +
                  (active
                    ? 'bg-brand-cyan text-white'
                    : 'text-neutral-300 hover:bg-neutral-800 hover:text-white')
                }
              >
                {item.label}
              </Link>
            );
          })}
          {nav.length === 0 && (
            <p className="px-3 py-2 text-xs text-neutral-500">
              Nenhuma tela liberada. Contate o administrador.
            </p>
          )}
        </nav>
        <div className="border-t border-neutral-800 p-3">
          <button
            onClick={handleLogout}
            className="w-full rounded px-3 py-2 text-left text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Coluna principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (somente mobile) */}
        <header className="flex h-14 items-center gap-3 bg-brand-bgDark px-4 text-white md:hidden">
          <button onClick={() => setOpen(true)} aria-label="Abrir menu">
            <MenuIcon />
          </button>
          <span className="font-bold">RPX Agenda</span>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl p-4 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
