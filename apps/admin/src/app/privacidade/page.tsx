import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidade — RPX Agenda',
  description: 'Como tratamos seus dados pessoais no app RPX Agenda e no painel administrativo.',
};

// PREMISSA: substituir os campos marcados com __...__ pelos dados reais da clínica
// antes da submissão à Apple/Google. A página é estática (renderizada pelo Next.js
// no servidor) e fica em https://rpxagenda.netlify.app/privacidade.
const CLINICA = {
  razaoSocial: '__RAZÃO SOCIAL DA CLÍNICA__',
  nomeFantasia: 'RPX — Reabilitação & Saúde e Performance',
  cnpj: '__CNPJ__',
  endereco: '__ENDEREÇO COMPLETO__',
  emailContato: '__contato@rpxagenda.com__',
  emailPrivacidade: '__privacidade@rpxagenda.com__',
  vigenciaDesde: '2026-05-31',
};

export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 text-neutral-800">
      <header className="mb-10 border-b border-neutral-200 pb-6">
        <h1 className="text-3xl font-extrabold text-brand-black">Política de Privacidade</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Aplicável ao app <strong>RPX Agenda</strong> e ao painel administrativo. Vigente desde{' '}
          {new Date(CLINICA.vigenciaDesde).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
          .
        </p>
      </header>

      <Section title="1. Quem é o responsável pelos seus dados">
        <p>
          O tratamento dos seus dados pessoais é realizado por{' '}
          <strong>{CLINICA.razaoSocial}</strong> (nome fantasia: {CLINICA.nomeFantasia}), CNPJ{' '}
          {CLINICA.cnpj}, com endereço em {CLINICA.endereco}. Quando esta Política mencionar{' '}
          <em>“nós”</em>, <em>“RPX”</em> ou <em>“clínica”</em>, refere-se à mesma empresa, na
          qualidade de <strong>Controladora</strong> dos dados (Lei nº 13.709/2018 — LGPD).
        </p>
      </Section>

      <Section title="2. Quais dados coletamos">
        <p>
          Coletamos apenas os dados necessários para prestar nosso serviço de agendamento e
          acompanhamento clínico:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Cadastro:</strong> nome completo, CPF, data de nascimento, telefone, e-mail e
            contato de emergência (quando informado).
          </li>
          <li>
            <strong>Acesso:</strong> e-mail e senha (armazenada como hash — nunca em texto puro).
          </li>
          <li>
            <strong>Saúde:</strong> dados clínicos do prontuário (avaliação, evolução de sessões,
            protocolo de tratamento, observações do profissional) — coletados pelos profissionais da
            clínica.
          </li>
          <li>
            <strong>Foto do paciente (opcional):</strong> imagem facial utilizada para identificação
            no atendimento, armazenada de forma cifrada em nuvem.
          </li>
          <li>
            <strong>Biometria facial (opcional):</strong> identificador gerado pelo equipamento de
            controle de acesso para validação automática do check-in nas sessões.
          </li>
          <li>
            <strong>Uso do app:</strong> agendamentos realizados, check-ins, histórico de sessões e
            pagamentos vinculados ao seu plano.
          </li>
          <li>
            <strong>Comunicações:</strong> e-mails transacionais (convite de acesso, redefinição de
            senha, lembretes).
          </li>
        </ul>
        <p className="mt-3">
          <strong>O app não coleta:</strong> localização precisa, contatos da agenda do celular,
          microfone, fotos da galeria que você não envie, nem utiliza SDKs de publicidade ou
          rastreamento de terceiros.
        </p>
      </Section>

      <Section title="3. Por que tratamos seus dados (finalidades)">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Cadastrar e identificar você como paciente da clínica.</li>
          <li>Possibilitar agendamento, alteração e cancelamento de sessões.</li>
          <li>Registrar a evolução clínica (prontuário) durante o tratamento.</li>
          <li>Operacionalizar check-in e controle de presença.</li>
          <li>Comunicar lembretes, avisos e informações de cobrança.</li>
          <li>Cumprir obrigações legais e regulatórias do setor de saúde.</li>
          <li>Prevenir fraudes e proteger a segurança dos sistemas.</li>
        </ul>
      </Section>

      <Section title="4. Bases legais (LGPD)">
        <p>
          Tratamos seus dados com fundamento em uma ou mais das seguintes bases legais previstas no
          art. 7º e art. 11 da LGPD:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Execução de contrato de prestação de serviços de saúde.</li>
          <li>Cumprimento de obrigação legal/regulatória.</li>
          <li>Tutela da saúde (art. 11, II, “f”) para os dados clínicos.</li>
          <li>Legítimo interesse, quando aplicável, sempre balanceado com seus direitos.</li>
          <li>Consentimento, para hipóteses específicas (ex.: uso da foto para identificação).</li>
        </ul>
      </Section>

      <Section title="5. Com quem compartilhamos">
        <p>
          Seus dados são compartilhados apenas com terceiros estritamente necessários para a
          operação do serviço, sob obrigação contratual de sigilo e proteção:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Provedores de infraestrutura em nuvem</strong> (AWS — Amazon Web Services, com
            servidores na região indicada na configuração do serviço).
          </li>
          <li>
            <strong>Provedor de envio de e-mails</strong> (Amazon SES) para mensagens transacionais.
          </li>
          <li>
            <strong>Gateway de pagamento</strong> (Pagar.me) quando aplicável à cobrança do seu
            plano.
          </li>
          <li>
            <strong>Equipamento de controle de acesso</strong> (iDFace ControliD) para o check-in
            biométrico, quando habilitado.
          </li>
          <li>Autoridades públicas, quando exigido por lei ou ordem judicial.</li>
        </ul>
        <p className="mt-3">
          Não vendemos seus dados e não compartilhamos informações com terceiros para finalidades de
          marketing.
        </p>
      </Section>

      <Section title="6. Como protegemos seus dados">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Conexões cifradas em trânsito (HTTPS/TLS).</li>
          <li>Senhas armazenadas com algoritmo de hash Argon2id.</li>
          <li>
            Controle de acesso por perfis (paciente, profissional, administrador), com auditoria de
            operações sensíveis.
          </li>
          <li>Tokens de sessão de curta duração, com rotação automática.</li>
          <li>
            Armazenamento das fotos em buckets privados com URLs temporárias geradas sob demanda.
          </li>
          <li>Monitoramento contínuo de incidentes e logs estruturados.</li>
        </ul>
        <p className="mt-3">
          Em caso de incidente de segurança que possa gerar risco relevante aos titulares, agimos
          conforme o art. 48 da LGPD e comunicaremos a ANPD e os titulares afetados.
        </p>
      </Section>

      <Section title="7. Por quanto tempo guardamos">
        <p>
          Mantemos seus dados durante o vínculo de atendimento e pelos prazos legais aplicáveis ao
          setor de saúde (em regra, no mínimo 20 anos para prontuário, conforme legislação vigente).
          Após o prazo, os dados são eliminados ou anonimizados.
        </p>
      </Section>

      <Section title="8. Seus direitos como titular">
        <p>
          Nos termos do art. 18 da LGPD, você pode, a qualquer momento, solicitar gratuitamente:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Confirmação da existência de tratamento.</li>
          <li>Acesso aos seus dados.</li>
          <li>Correção de dados incompletos, inexatos ou desatualizados.</li>
          <li>
            Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em
            desconformidade com a LGPD.
          </li>
          <li>Portabilidade dos dados, observado o segredo profissional e comercial.</li>
          <li>
            Eliminação dos dados tratados com seu consentimento, ressalvadas as hipóteses do art. 16
            da LGPD.
          </li>
          <li>Informação sobre uso compartilhado de dados.</li>
          <li>Revogação do consentimento, quando aplicável.</li>
        </ul>
        <p className="mt-3">
          Para exercer seus direitos, envie um e-mail para{' '}
          <a
            className="font-semibold text-brand-cyanDark"
            href={`mailto:${CLINICA.emailPrivacidade}`}
          >
            {CLINICA.emailPrivacidade}
          </a>
          . Responderemos no prazo previsto em lei.
        </p>
      </Section>

      <Section title="9. Exclusão de conta">
        <p>
          A exclusão da sua conta de acesso ao app pode ser solicitada a qualquer momento por e-mail
          ou pessoalmente na recepção da clínica. O prontuário clínico será mantido pelo prazo
          legal, mesmo após o encerramento do acesso ao app, conforme exigência regulatória.
        </p>
      </Section>

      <Section title="10. Crianças e adolescentes">
        <p>
          O app é destinado a pacientes da clínica. O tratamento de dados de crianças e adolescentes
          só ocorre quando há vínculo de atendimento, mediante consentimento específico e em
          destaque de ao menos um dos pais ou responsável legal, conforme o art. 14 da LGPD.
        </p>
      </Section>

      <Section title="11. Alterações desta Política">
        <p>
          Podemos atualizar esta Política para refletir melhorias do serviço ou mudanças legais.
          Quando houver alteração relevante, comunicaremos por meio do app ou e-mail. A data da
          última atualização está no topo desta página.
        </p>
      </Section>

      <Section title="12. Contato">
        <p>
          Para dúvidas sobre privacidade e proteção de dados, fale com nosso encarregado:{' '}
          <a
            className="font-semibold text-brand-cyanDark"
            href={`mailto:${CLINICA.emailPrivacidade}`}
          >
            {CLINICA.emailPrivacidade}
          </a>
          . Para outros assuntos, use{' '}
          <a className="font-semibold text-brand-cyanDark" href={`mailto:${CLINICA.emailContato}`}>
            {CLINICA.emailContato}
          </a>{' '}
          ou acesse nossa{' '}
          <a className="font-semibold text-brand-cyanDark" href="/suporte">
            página de suporte
          </a>
          .
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 text-[15px] leading-7">
      <h2 className="mb-3 text-lg font-bold text-brand-black">{title}</h2>
      <div className="space-y-2 text-neutral-700">{children}</div>
    </section>
  );
}
