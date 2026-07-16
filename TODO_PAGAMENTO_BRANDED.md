# TODO — Pagamento branded do portal do cliente BS (2026-07-16)

Tela de pagamento com **nosso visual** (marca Brasil Solar) que "mascara" o checkout
hospedado do Asaas. O cliente recebe um link nosso, escolhe PIX / boleto / cartão e paga
sem sair do domínio da Brasil Solar. Fases 0+1+2 aprovadas e implementadas.

**Como funciona:** o link enviado é `/portal-cliente/pagar/<conviteToken>` (o `conviteToken`
do `BrasilSolarAcesso`, agora gerado já na criação do convite). A página é pública
(pagador ainda não tem conta) — a autenticação é o token na URL. A confirmação do acesso
continua vindo pelo **webhook do Asaas** (não ativamos direto).

---

## ✅ FEITO (código) — `tsc --noEmit` 0 erros + `next build` completo OK

### Arquivos novos
- [x] `src/lib/asaas-cartao.ts` — checkout transparente de cartão (`pagarCobrancaComCartao` →
      POST `/payments/{id}/payWithCreditCard`). Cartão nunca persistido no nosso banco.
- [x] `src/lib/portal-cobranca.ts` — resolve token → cobrança aberta no Asaas; monta views de
      PIX (`getPixDaCobranca`), boleto (`getBoletoDaCobranca`), status (`getCobrancaView`) e
      pagamento por cartão (`pagarCartaoDaCobranca`). MENSAL: pega a 1ª cobrança em aberto da assinatura.
- [x] `src/app/api/portal/cobranca/[token]/route.ts` — GET status/valor (público).
- [x] `src/app/api/portal/cobranca/[token]/pix/route.ts` — GET QR + copia-e-cola.
- [x] `src/app/api/portal/cobranca/[token]/boleto/route.ts` — GET linha digitável + PDF.
- [x] `src/app/api/portal/cobranca/[token]/cartao/route.ts` — POST paga com cartão (IP via x-forwarded-for).
- [x] `src/app/portal-cliente/pagar/[token]/page.tsx` — página branded (server, force-dynamic).
- [x] `src/components/brasil-solar/pagamento-branded.tsx` — tela client: abas PIX/Boleto/Cartão,
      paleta teal #2E9B87 / laranja #EA6E2C, polling 6s do status, tela "Pagamento confirmado".

### Arquivos editados
- [x] `src/proxy.ts` — `/portal-cliente/pagar/(.*)` liberado (público) + `/api/portal/cobranca/(.*)`
      no `isPublicApi`. Autenticação = token na URL, não sessão Clerk.
- [x] `src/lib/brasil-solar-acesso.ts` — `buildPagamentoUrl(token)` (usa APP_BASE_URL); `criarConviteAcesso`
      gera `conviteToken` no upsert e retorna `pagamentoUrl` + `conviteToken` (aditivo).
- [x] `src/components/brasil-solar/convite-acesso-modal.tsx` — interface `Acesso` ganhou `pagamentoUrl?`;
      derivado `linkPagamento = pagamentoUrl ?? checkoutUrl` usado no copiar/campo/href/condição; texto
      atualizado ("nossa página" em vez de "página do Asaas").
- [x] `convite/route.ts` (GET) — select ganhou `conviteToken`; retorna `pagamentoUrl` (buildPagamentoUrl)
      e omite o token cru.

### Decisões que evitaram conflito com edição paralela
- [x] Sem mudança de `schema.prisma` (estava sujo) — reuso do `conviteToken` (@unique) como chave.
- [x] Cartão em arquivo novo `asaas-cartao.ts` — não editei `asaas.ts` (também sujo), só importei o que já exporta.

---

## ⏳ PENDENTE (config + teste, não é código)

### 1. Configurar env
- [ ] **`APP_BASE_URL`** (ou `NEXT_PUBLIC_APP_BASE_URL`) no `.env` local e no Railway.
      Ex.: `https://<dominio-do-app>`. **Sem isso o link sai sem host** (`/portal-cliente/pagar/...`).

### 2. Reiniciar dev server
- [ ] O `next build` reescreveu o `.next` — se o dev estava rodando, matar o PID da porta 3000 e `npm run dev`.

### 3. Teste E2E em sandbox Asaas
- [ ] Gerar cobrança pelo modal do proprietário → copiar o **link branded** → abrir a tela.
- [ ] **PIX**: QR + copia-e-cola aparecem; pagar no sandbox → tela vira "Pagamento confirmado" (polling).
- [ ] **Boleto**: linha digitável + botão "Baixar boleto (PDF)".
- [ ] **Cartão**: preencher cartão + titular → pagar → confirmação. (Requer `remoteIp` — ok atrás do proxy Railway.)
- [ ] Confirmar que o **webhook Asaas** ativa o acesso e dispara o convite de cadastro (fluxo já existente).
- [ ] Pré-req do webhook: `ASAAS_WEBHOOK_TOKEN` no `.env` + URL `.../api/webhooks/asaas` no painel Asaas.

### 4. Deploy
- [ ] `railway up --ci` (snapshot do working tree — leva junto o que estiver no dir; GitHub NÃO sincronizado).

---

## 🔮 FUTURO (Fase 3 — recorrência de cartão)
- [ ] Cobrar mês seguinte sem reinserir cartão: o `payWithCreditCard` já devolve `creditCardToken`
      (salvo no retorno de `pagarCobrancaComCartao`) — plugar na assinatura mensal.
- [ ] Alternativa sem PCI: **PIX Automático** (mandato BC) — já mapeado em `asaas.ts`
      (`createPixAutomaticAuthorization`), vale a pena p/ ticket acima de ~R$50.

Ver memória: `project_pagamento_branded_bs.md`, `project_acesso_pago_bs_fase1.md`,
`project_camada_pagamentos_multi_provider.md`.
