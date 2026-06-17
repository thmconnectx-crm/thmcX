# ThM ConnectX

MVP de CRM para captacao de leads, prospeccao ativa controlada, WhatsApp Cloud API oficial, IA de pre-atendimento e handoff humano.

## Principios de compliance

- Nao usa WhatsApp Web nao oficial.
- Nao tenta burlar limites, bloqueios, chips ou politicas da Meta.
- Nao envia para `opt_out=true`.
- Campanhas so enviam para `opt_in_status=authorized`.
- Primeira abordagem usa template oficial aprovado do WhatsApp Cloud API.
- Mantem historico completo, logs de envio e opt-out automatico.
- Respeita janela de horario, limite diario e tentativa maxima de reenvio.

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
Previa local sem credenciais: `http://localhost:5174/?preview=1`

## Usuario inicial

Abra o painel fora de `?preview=1` e use `Criar conta`. A primeira conta criada vira admin do tenant/empresa.

## Webhook WhatsApp

Configure no painel Meta:

- Callback URL: `https://sua-api.com/webhooks/whatsapp`
- Verify token: mesmo valor de `WHATSAPP_VERIFY_TOKEN`

## Deploy

Backend e workers podem rodar em Render/Railway usando o mesmo codigo:

- API: `npm run start -w server`
- Worker: `npm run worker -w server`
- Worker inbound: `npm run inbound-worker`

Configure Redis, Supabase e variaveis de ambiente nos services. Veja `docs/DEPLOY.md` e `render.yaml`.
