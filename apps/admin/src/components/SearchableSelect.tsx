'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Select com busca por digitação (combobox). Drop-in para `<select>`:
 * as `options` incluem a opção vazia (value: '') quando existir um "Selecione…"/"Todos".
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecione…',
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Classe do wrapper (ex.: largura). */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={ref} className={'relative ' + (className ?? '')}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="input flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selected && selected.value ? 'truncate' : 'truncate text-neutral-400'}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="shrink-0 text-neutral-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-neutral-200 bg-white shadow-lg">
          <div className="p-2">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered.length > 0) {
                  e.preventDefault();
                  choose(filtered[0].value);
                }
              }}
              placeholder="Digite para filtrar…"
              className="w-full rounded border border-neutral-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-cyan"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto pb-1 text-sm">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-neutral-400">Nenhum resultado</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value || '__empty__'}>
                  <button
                    type="button"
                    onClick={() => choose(o.value)}
                    className={
                      'block w-full truncate px-3 py-1.5 text-left hover:bg-neutral-50 ' +
                      (o.value === value ? 'bg-brand-cyanLight text-brand-cyanDark' : '')
                    }
                  >
                    {o.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
