# ThM ConnectX

MVP de CRM para captação de leads, prospecção ativa controlada, WhatsApp Cloud API oficial, IA de pré-atendimento e handoff humano.

## Princípios de compliance

- Não usa WhatsApp Web não oficial.
- Não tenta burlar limites, bloqueios, chips ou políticas da Meta.
- Não envia para `opt_out=true`.
- Campanhas só enviam para `opt_in_status=authorized`.
- Primeira abordagem usa template oficial aprovado do WhatsApp Cloud API.
- Mantém histórico completo, logs de envio e opt-out automático.
- Respeita janela de horário, limite diário e tentativa máxima de reenvio.

## Stack

- Node.js + Express
- Supabase/PostgreSQL
- Redis + BullMQ
- WhatsApp Cloud API oficial
- OpenAI API
- React + Tailwind

## Setup local

1. Copie `.env.example` para `.env` e preencha as credenciais.
2. Rode `server/supabase/schema.sql` no SQL Editor do Supabase para um banco novo. Para banco existente, siga `docs/DEPLOY.md`.
3. Instale dependencias:

```bash
npm install
```

4. Inicie API, worker, worker inbound e painel:

```bash
npm run dev
npm run worker -w server
npm run inbound-worker
```

API: `http://localhost:4000`
Painel: `http://localhost:5173` ou outra porta livre do Vite.

## Usuario inicial

Abra o painel e use `Criar conta`. A primeira conta criada vira admin do tenant/empresa.

## Webhook WhatsApp

Configure no painel Meta:

- Callback URL: `https://sua-api.com/webhooks/whatsapp`
- Verify token: mesmo valor de `WHATSAPP_VERIFY_TOKEN`

## Deploy

O projeto tem dois modos de deploy:

- `render.yaml`: modo Free/manual para validar oferta, templates, leads e envio controlado sem Redis/worker.
- `render.worker.yaml`: modo Starter/worker para disparos em fila com Redis e BullMQ quando a validação comercial estiver pronta.

No modo manual, campanhas ficam ativas, mas o envio é acionado pelo botão `Enviar próximo` no painel. Webhooks recebidos são processados pela própria API.

Backend e workers podem rodar em Render/Railway usando o mesmo código:

- API: `npm run start -w server`
- Worker: `npm run worker -w server`
- Worker inbound: `npm run inbound-worker`

Configure Supabase e variáveis de ambiente nos services. Redis só é obrigatório ao usar `render.worker.yaml`. Veja `docs/DEPLOY.md`.
