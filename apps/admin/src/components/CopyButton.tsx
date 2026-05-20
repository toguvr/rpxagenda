'use client';

import { useState } from 'react';

export function CopyButton({ value, label = 'Copiar' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // ignore — clipboard pode falhar em contextos sem https
        }
      }}
      className="text-sm text-brand-cyanDark hover:underline"
    >
      {copied ? 'Copiado ✓' : label}
    </button>
  );
}
