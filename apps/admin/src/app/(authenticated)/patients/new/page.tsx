'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserRole, type PatientResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { Card } from '@/components/Card';

export default function NewPatientPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [notes, setNotes] = useState('');
  const [adminReference, setAdminReference] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsAdmin(getCurrentUser()?.role === UserRole.ADMIN);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorDetails(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        fullName,
        cpf,
        birthDate,
        phone,
      };
      if (email.trim()) body.email = email.trim();
      if (emergencyContact.trim()) body.emergencyContact = emergencyContact.trim();
      if (notes.trim()) body.notes = notes.trim();
      if (isAdmin && adminReference.trim()) body.adminReference = adminReference.trim();
      const created = await api<PatientResponse>('/patients', { method: 'POST', body });
      router.replace(`/patients/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrorDetails(err.details);
      } else {
        setError('Falha ao cadastrar paciente.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/patients" className="text-sm text-brand-cyanDark hover:underline">
            ← voltar
          </Link>
          <h1 className="text-2xl font-bold text-brand-black mt-1">Novo paciente</h1>
        </div>
      </div>

      <Card title="Dados cadastrais">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Nome completo *
            </label>
            <input
              type="text"
              required
              minLength={3}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">CPF *</label>
            <input
              type="text"
              required
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Data de nascimento *
            </label>
            <input
              type="date"
              required
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Telefone *</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+55 31 99999-0000"
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Obrigatório se quiser gerar convite de acesso ao app.
            </p>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Contato de emergência
            </label>
            <input
              type="text"
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              placeholder="Nome - telefone"
              className="input"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-neutral-700 mb-1">Observações</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input resize-none"
            />
          </div>

          {isAdmin && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Apelido / referência (interno)
              </label>
              <input
                type="text"
                value={adminReference}
                onChange={(e) => setAdminReference(e.target.value)}
                maxLength={200}
                placeholder="Como a recepção identifica o paciente (visível só para admins)"
                className="input"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Visível apenas para administradores. Profissionais não veem este campo.
              </p>
            </div>
          )}

          {error && (
            <div className="col-span-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              <div className="font-medium">{error}</div>
              {Array.isArray((errorDetails as { issues?: unknown[] })?.issues) && (
                <ul className="mt-1 text-xs list-disc list-inside">
                  {(errorDetails as { issues: { path: string[]; message: string }[] }).issues.map(
                    (i, idx) => (
                      <li key={idx}>
                        <code>{i.path.join('.')}</code>: {i.message}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          )}

          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Link href="/patients" className="btn-outline">
              Cancelar
            </Link>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Salvando…' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
