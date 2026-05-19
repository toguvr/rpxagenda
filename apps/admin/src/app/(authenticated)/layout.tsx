'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AuthenticatedUser } from '@rpx/shared';
import { getCurrentUser, isAuthenticated } from '@/lib/auth';
import { logoutApi } from '@/lib/api';

const NAV = [
  { href: '/appointments', label: 'Agenda' },
  { href: '/patients', label: 'Pacientes' },
] as const;

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    setUser(getCurrentUser());
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-400">Carregando…</div>
    );
  }

  return (
    <div className="flex h-screen bg-neutral-50">
      <aside className="w-60 bg-brand-bgDark text-white flex flex-col">
        <div className="p-6 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-brand-cyan flex items-center justify-center font-bold">
              R
            </div>
            <div>
              <div className="font-bold text-white">RPX Expert</div>
              <div className="text-xs text-neutral-400">{user?.fullName ?? user?.email}</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  'block px-3 py-2 rounded text-sm font-medium transition-colors ' +
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
        <div className="p-3 border-t border-neutral-800">
          <button
            onClick={async () => {
              await logoutApi();
              router.replace('/login');
            }}
            className="w-full text-left text-sm text-neutral-400 hover:text-white px-3 py-2 rounded hover:bg-neutral-800 transition-colors"
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-8">{children}</div>
      </main>
    </div>
  );
}
