'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(isAuthenticated() ? '/appointments' : '/login');
  }, [router]);
  return (
    <div className="flex h-screen items-center justify-center text-neutral-400">Carregando…</div>
  );
}
