'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AuthenticatedUser } from '@rpx/shared';
import { getCurrentUser, isAuthenticated } from '@/lib/auth';
import { logoutApi } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Painel' },
  { href: '/appointments', label: 'Agenda' },
  { href: '/patients', label: 'Pacientes' },
  { href: '/plans', label: 'Planos' },
  { href: '/services', label: 'Serviços' },
  { href: '/schedules', label: 'Horários' },
  { href: '/equipments', label: 'Equipamentos' },
  { href: '/professionals', label: 'Profissionais' },
] as const;

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
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-brand-cyan font-bold">
              R
            </div>
            <div className="min-w-0">
              <div className="font-bold text-white">RPX Expert</div>
              <div className="truncate text-xs text-neutral-400">
                {user?.fullName ?? user?.email}
              </div>
            </div>
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
          {NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
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
          <span className="font-bold">RPX Expert</span>
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
