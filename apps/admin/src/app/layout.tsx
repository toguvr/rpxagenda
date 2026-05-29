import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RPX Agenda — Admin',
  description: 'Painel administrativo da RPX Agenda',
};

// Admin é 100% dinâmico (auth client-side via token, dados sempre da API).
// Sem prerender estático — evita erros de SSG em páginas client-only.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
