'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Select com busca por digitação (combobox). Drop-in para `<select>`:
 * as `options` incluem a opção vazia (value: '') quando existir um "Selecione…"/"Todos".
 *
 * O painel de opções é renderizado num PORTAL (document.body) com posição `fixed`
 * calculada a partir do botão — assim nunca é cortado por um ancestral com
 * `overflow-hidden` (ex.: o `Card`).
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const reposition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4, width: r.width });
  }, []);

  // Posiciona o painel ao abrir e reposiciona em scroll/resize.
  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  // Fecha ao clicar fora (considera o botão E o painel, que está no portal).
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
      setQuery('');
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
    <div ref={wrapRef} className={'relative ' + (className ?? '')}>
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

      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              width: pos.width,
              zIndex: 50,
            }}
            className="rounded-md border border-neutral-200 bg-white shadow-lg"
          >
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
          </div>,
          document.body,
        )}
    </div>
  );
}
