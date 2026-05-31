import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Suporte — RPX Agenda',
  description:
    'Canais de atendimento, dúvidas frequentes e contato para pacientes que usam o app RPX Agenda.',
};

// PREMISSA: substituir os campos marcados com __...__ pelos contatos reais da
// clínica antes da submissão à Apple/Google. A página é pública e fica em
// https://rpxagenda.netlify.app/suporte.
const CONTATO = {
  whatsapp: '__+55 (XX) XXXXX-XXXX__',
  whatsappLink: '__https://wa.me/55XXXXXXXXXXX__',
  telefone: '__(XX) XXXX-XXXX__',
  email: '__contato@rpxagenda.com__',
  horario: 'Segunda a sexta, das 7h às 20h • Sábado, das 8h às 12h',
  endereco: '__ENDEREÇO COMPLETO DA CLÍNICA__',
};

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Como faço meu primeiro acesso ao app?',
    a: (
      <>
        O cadastro é feito pela recepção da clínica. Após o seu cadastro, você recebe um e-mail com
        um link para criar a sua senha. O link tem validade de 7 dias — se expirar, peça para a
        recepção gerar um novo convite.
      </>
    ),
  },
  {
    q: 'Esqueci minha senha. Como recupero?',
    a: (
      <>
        Na tela de login do app, toque em <strong>Esqueci a senha</strong>, informe seu e-mail e
        envie. Você receberá um link de redefinição válido por 30 minutos. Caso não receba,
        verifique o spam ou fale com a recepção.
      </>
    ),
  },
  {
    q: 'Como agendar uma sessão?',
    a: (
      <>
        Na tela inicial, toque em <strong>Agendar</strong>. Escolha o plano, depois o dia (o app
        mostra apenas os dias com horário disponível) e por fim o horário. Confirme — pronto, sua
        sessão está marcada.
      </>
    ),
  },
  {
    q: 'Como cancelar uma sessão?',
    a: (
      <>
        Na lista de agendamentos, abra a sessão e selecione <strong>Cancelar</strong>. O
        cancelamento dentro do prazo definido pela clínica devolve a sessão ao seu plano; fora do
        prazo, a sessão é descontada. Em caso de dúvida, fale com a recepção.
      </>
    ),
  },
  {
    q: 'Quantas sessões eu tenho disponíveis?',
    a: (
      <>
        Seu saldo aparece em <strong>Meus planos</strong>. Para pacotes, mostramos o número de
        sessões restantes; para assinatura, o limite semanal.
      </>
    ),
  },
  {
    q: 'Não consigo entrar. O que faço?',
    a: (
      <>
        Verifique sua internet, depois confirme se está usando o e-mail correto. Se persistir, use o
        fluxo de <strong>Esqueci a senha</strong> ou nos chame pelos canais abaixo.
      </>
    ),
  },
  {
    q: 'Quero excluir minha conta. É possível?',
    a: (
      <>
        Sim. Solicite a exclusão por e-mail no endereço listado abaixo ou pessoalmente na recepção.
        O prontuário clínico é mantido pelo prazo legal mesmo após a exclusão do acesso ao app.
      </>
    ),
  },
];

export default function SuportePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 text-neutral-800">
      <header className="mb-10 border-b border-neutral-200 pb-6">
        <h1 className="text-3xl font-extrabold text-brand-black">Suporte</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Aqui você encontra como falar com a gente e respostas para as dúvidas mais comuns sobre o
          app <strong>RPX Agenda</strong>.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-bold text-brand-black">Canais de atendimento</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ContactCard
            label="WhatsApp"
            value={CONTATO.whatsapp}
            href={CONTATO.whatsappLink}
            hint="Resposta em até 1 dia útil"
          />
          <ContactCard
            label="E-mail"
            value={CONTATO.email}
            href={`mailto:${CONTATO.email}`}
            hint="Resposta em até 2 dias úteis"
          />
          <ContactCard
            label="Telefone"
            value={CONTATO.telefone}
            href={`tel:${CONTATO.telefone.replace(/[^\d+]/g, '')}`}
            hint={CONTATO.horario}
          />
          <ContactCard
            label="Atendimento presencial"
            value={CONTATO.endereco}
            hint={CONTATO.horario}
          />
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-bold text-brand-black">Perguntas frequentes</h2>
        <div className="space-y-4">
          {FAQ.map((item) => (
            <div
              key={item.q}
              className="rounded-lg border border-neutral-200 bg-white px-4 py-4 text-[15px] leading-7"
            >
              <p className="mb-1.5 font-bold text-brand-black">{item.q}</p>
              <p className="text-neutral-700">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10 rounded-lg border border-brand-cyanLight bg-brand-cyanLight/40 px-5 py-5">
        <h2 className="mb-2 text-base font-bold text-brand-black">Privacidade e seus dados</h2>
        <p className="text-[14px] leading-6 text-neutral-700">
          Para detalhes sobre como tratamos seus dados pessoais, leia a nossa{' '}
          <a className="font-semibold text-brand-cyanDark" href="/privacidade">
            Política de Privacidade
          </a>
          .
        </p>
      </section>

      <p className="text-xs text-neutral-400">
        RPX — Reabilitação & Saúde e Performance. Conteúdo desta página atualizado em{' '}
        {new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })}
        .
      </p>
    </main>
  );
}

function ContactCard({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: string;
  href?: string;
  hint?: string;
}) {
  const body = (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-4 text-[15px]">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1.5 font-bold text-brand-black">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-neutral-400">{hint}</p> : null}
    </div>
  );
  if (!href) return body;
  return (
    <a href={href} className="block transition-colors hover:border-brand-cyan">
      {body}
    </a>
  );
}
