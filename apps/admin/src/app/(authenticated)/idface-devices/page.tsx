'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { UserRole, type IdfaceDeviceResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { Modal } from '@/components/Modal';

export default function IdfaceDevicesPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<IdfaceDeviceResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // modal de criar/editar
  const [editing, setEditing] = useState<IdfaceDeviceResponse | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const ok = getCurrentUser()?.role === UserRole.ADMIN;
    setAllowed(ok);
    if (!ok) router.replace('/dashboard');
  }, [router]);

  useEffect(() => {
    if (!allowed) return;
    api<IdfaceDeviceResponse[]>('/idface-devices')
      .then(setDevices)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Falha ao carregar equipamentos.'),
      );
  }, [allowed]);

  async function reload() {
    setDevices(await api<IdfaceDeviceResponse[]>('/idface-devices'));
  }

  async function handleRemove(id: string) {
    if (!confirm('Remover este equipamento? Eventos futuros serão recusados.')) return;
    try {
      await api(`/idface-devices/${id}`, { method: 'DELETE' });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover.');
    }
  }

  if (allowed === null) return <div className="text-neutral-400">Carregando…</div>;
  if (!allowed) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold text-brand-black">Equipamentos iDFace</h1>
          <p className="text-sm text-neutral-500">
            Totens de reconhecimento facial registrados na sua unidade.
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary whitespace-nowrap">
          Novo equipamento
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {!devices ? (
        <div className="text-neutral-400">Carregando…</div>
      ) : devices.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-neutral-500">
          Nenhum equipamento iDFace cadastrado. Adicione um para começar a usar a catraca.
        </div>
      ) : (
        <div className="table-wrap mb-6">
          <table className="table-base">
            <thead>
              <tr>
                <th>Nome</th>
                <th>deviceId</th>
                <th>Status</th>
                <th>Último contato</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium">{d.name}</td>
                  <td className="font-mono text-xs">{d.deviceId}</td>
                  <td>
                    <span
                      className={
                        'inline-block rounded-full px-2 py-0.5 text-xs font-medium ' +
                        (d.active
                          ? 'bg-green-50 text-green-700'
                          : 'bg-neutral-100 text-neutral-500')
                      }
                    >
                      {d.active ? 'Ativo' : 'Desativado'}
                    </span>
                  </td>
                  <td className="text-sm text-neutral-500">
                    {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString('pt-BR') : '—'}
                  </td>
                  <td>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setEditing(d)}
                        className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium hover:border-brand-cyan"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleRemove(d.id)}
                        className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfigInstructions />

      {(creating || editing) && (
        <DeviceFormModal
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function DeviceFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: IdfaceDeviceResponse | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [deviceId, setDeviceId] = useState(initial?.deviceId ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = { name: name.trim(), deviceId: deviceId.trim(), active };
      if (initial) {
        await api(`/idface-devices/${initial.id}`, { method: 'PATCH', body });
      } else {
        await api('/idface-devices', { method: 'POST', body });
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? 'Editar equipamento' : 'Novo equipamento'}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Nome *</label>
          <input
            type="text"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Recepção, Sala 2"
            className="input"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">deviceId *</label>
          <input
            type="text"
            required
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            placeholder="Ex: 935107"
            className="input font-mono"
          />
          <p className="mt-1 text-xs text-neutral-500">
            ID que o equipamento iDFace envia no Push. Disponível na tela de configuração do próprio
            equipamento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="active"
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 accent-brand-cyan"
          />
          <label htmlFor="active" className="text-sm font-medium text-neutral-700">
            Equipamento ativo
          </label>
        </div>
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-outline">
            Cancelar
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Salvando…' : initial ? 'Salvar' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConfigInstructions() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'https://rpxagenda.togu.dev';
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-700">
      <h2 className="mb-2 text-base font-bold text-brand-black">
        Como configurar o equipamento iDFace (modo Push)
      </h2>
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>
          Acesse a interface de administração do iDFace e abra{' '}
          <strong>Configurações → Push Server</strong>.
        </li>
        <li>
          Coloque a URL base:{' '}
          <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">
            {apiBase}/webhooks/idface
          </code>
        </li>
        <li>
          Adicione o header{' '}
          <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">X-IDFace-Secret</code>{' '}
          com o segredo que está no <code>IDFACE_WEBHOOK_SECRET</code> da API.
        </li>
        <li>
          Defina os endpoints relativos: <code className="font-mono text-xs">push</code> (GET) e{' '}
          <code className="font-mono text-xs">result</code> (POST). Intervalo de polling de 5–10 s é
          razoável.
        </li>
        <li>
          Configure também o webhook de eventos de acesso (catraca) para apontar para{' '}
          <code className="font-mono text-xs">access-event</code> (POST).
        </li>
        <li>
          Anote o <code>deviceId</code> que o equipamento usa nos requests (geralmente o número de
          série) e cadastre acima — sem isso, nenhuma foto é enviada e nenhum check-in funciona.
        </li>
      </ol>
    </div>
  );
}
