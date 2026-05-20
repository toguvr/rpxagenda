import type { ReactNode } from 'react';

export function Card({
  children,
  title,
  action,
}: {
  children: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
      {(title || action) && (
        <header className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between gap-3">
          {title && <h2 className="font-semibold text-brand-black">{title}</h2>}
          {action && <div className="flex items-center gap-2">{action}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
