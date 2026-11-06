# Sessão 17 — Acesso de profissionais pelo totem iDFace

Data: 2026-11-06
Branch: `master` (alterações locais, **não commitadas e não deployadas**)
Escopo: profissionais recebiam "não autorizado" no totem de reconhecimento facial. Diagnóstico da causa e implementação do cadastro facial + liberação de profissionais.

---

## 1. Diagnóstico

O totem roda em modo online: a cada rosto identificado ele pergunta à API se libera a porta. A API só conhecia **paciente com agendamento na janela de check-in**. Qualquer outro ID caía em `PATIENT_NOT_FOUND` e o totem negava. Não existia `idfaceUserId`, foto nem cadastro biométrico para `Professional`.

Eventos negados em 2026-11-06 (12:18–12:21 BRT), todos `PATIENT_NOT_FOUND`:

| ID no totem | Origem                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------- |
| `2`         | Pessoa cadastrada direto no equipamento, desconhecida do sistema                         |
| `0` (2x)    | Rosto não reconhecido pelo equipamento                                                   |
| `1004`      | Cadastro facial antigo de "Augusto Telles Francisco"; o paciente hoje aponta para `1005` |

O painel web não tinha relação: zero respostas 403 na API nas 72h anteriores.

## 2. O que foi feito

**Regra nova (CLAUDE.md §4.6):** profissional **ativo** com rosto cadastrado é liberado **a qualquer hora, sem agendamento**. Evento gravado com outcome `PROFESSIONAL_ACCESS` e `professionalId`. Profissional inativo ou removido é negado.

| Camada    | Mudança                                                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema    | `Professional.photoKey` / `idfaceUserId`; `IdfaceEvent.professionalId`; `IdfaceEnrollment` e `IdfaceCommand` passam a ter dono paciente **ou** profissional; enum `PROFESSIONAL_ACCESS` |
| API       | `POST /professionals/:id/photo/upload-url`, `PUT /professionals/:id/photo`, `GET /professionals/:id/photo-url` (todos só ADMIN)                                                         |
| API       | `IdfaceEnrollmentsService.enqueueProfessionalEnrollment` (mesmo ciclo DESTROY → CREATE_USER → SET_IMAGE)                                                                                |
| API       | `IdfaceService.processEvent`: se o ID não é de paciente, procura profissional ativo da unidade do device e libera                                                                       |
| Shared    | outcome `PROFESSIONAL_ACCESS`; `ProfessionalResponse.photoKey` / `hasIdfaceEnrolled`                                                                                                    |
| Admin     | Card "Acesso pelo totem (iDFace)" na edição do profissional (foto por câmera ou arquivo + status); coluna "Totem" na lista                                                              |
| Admin     | `PatientPhoto` virou `PersonPhoto` (genérico, usado por paciente e profissional)                                                                                                        |
| Auditoria | Salvar a foto do profissional grava `AuditLog` (`PROFESSIONAL_FACE_ENROLLMENT_REQUESTED`)                                                                                               |

Migration: `20261106160000_professional_idface_access`. Apenas aditiva (colunas anuláveis, valor novo de enum, `DROP NOT NULL`, dois `CHECK` de dono único). Nenhuma linha existente é alterada.

## 3. Decisões

- **Qualquer hora** (decisão do stakeholder em 2026-11-06): não há checagem de horário de funcionamento para profissional.
- **Mesmo contador de IDs** de pacientes (`Unit.nextIdfaceUserId`): um ID do equipamento nunca pertence a um paciente e a um profissional ao mesmo tempo, então a busca "paciente primeiro, depois profissional" não é ambígua.
- **Foto e biometria do profissional só para ADMIN**, por dar acesso físico à clínica.

## 4. Premissas

> PREMISSA: desativar ou remover um profissional **não** apaga o rosto dele do equipamento. O bloqueio é feito pelo servidor (modo online), que nega inativos e removidos. Se o totem for colocado em modo offline/standalone, esse rosto voltaria a abrir a porta.

> PREMISSA: o campo `registration` enviado ao equipamento para o profissional é o registro profissional (CREFITO/CREF), no lugar do CPF usado para pacientes.

## 5. Verificação

- `tsc --noEmit` em `@rpx/api` e `@rpx/admin`: ok. ESLint nos arquivos alterados: ok.
- Testes novos, com Prisma em memória: `idface.service.spec.ts` (9) e `idface-enrollments.service.spec.ts` (6). Suíte unitária: 107 testes passando.
- `patients.invite.spec.ts` não compila (`Expected 7 arguments, but got 3`). Já estava assim antes desta sessão.
- Migration validada em um Postgres 16 descartável (Docker local): as 20 migrations anteriores + linhas legadas de enrollment/comando/evento, depois a nova. Dados legados intactos; os `CHECK` rejeitam enrollment sem dono ou com dois donos; ID duplicado de profissional na unidade é rejeitado; remover o profissional apaga enrollments/comandos e preserva o evento. `prisma migrate diff` não acusa diferença nas tabelas alteradas (há um drift antigo e não relacionado na FK `protocols.planId`).
- **Não verificado:** a migration não foi aplicada em produção e o fluxo não foi exercitado contra o totem real. Os specs de integração não foram rodados (ver alerta abaixo).

## 6. Alerta: testes de integração apagam o banco configurado

`apps/api/.env` aponta para o banco de **produção**, e os specs `*.integration.spec.ts` executam `deleteMany({})` em pacientes, agendamentos, planos, profissionais etc. Rodar `pnpm test` (ou `jest` sem filtro) com esse `.env` apaga os dados de produção. Nesta sessão só foram rodados specs que não tocam o banco (`--testPathIgnorePatterns integration.spec.ts`).

## 7. Próximos passos

1. Deploy: `./deploy/deploy.sh --migrate` (aplica a migration e sobe a API). Publicar o admin.
2. No admin, abrir cada profissional → "Acesso pelo totem (iDFace)" → enviar a foto. Em alguns segundos o status vira "Rosto cadastrado".
3. Remover do equipamento os usuários órfãos `2` e `1004`.
4. Apontar os testes de integração para um banco próprio (ex: `.env.test` + guarda que recusa rodar contra host de produção).
5. Consertar `patients.invite.spec.ts`.
6. Opcional: comando de remoção do rosto no equipamento ao desativar/remover profissional (fecha a premissa da seção 4).
