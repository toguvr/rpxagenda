'use client';

import { useEffect, type ReactNode } from 'react';

/** Modal simples — backdrop preto translúcido + caixa branca centralizada. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden"
      >
        {title && (
          <header className="px-5 py-4 border-b border-neutral-200">
            <h2 className="font-semibold text-brand-black">{title}</h2>
          </header>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
