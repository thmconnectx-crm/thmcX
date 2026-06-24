# Deploy Supabase + Render

Este roteiro prepara o ThM ConnectX para o primeiro teste real com leads, WhatsApp Cloud API e IA.

## 1. Preparar o Supabase

No Supabase, crie um projeto e rode o schema principal no SQL Editor:

```sql
-- cole o conteúdo de server/supabase/schema.sql
```

Se o banco já recebeu versões anteriores, rode as migrations nesta ordem:

1. `server/supabase/2026-06-15-connectx-integrations.sql`
2. `server/supabase/2026-06-16-refresh-tokens.sql`
3. `server/supabase/2026-06-16-messages-whatsapp-message-id-unique.sql`
4. `server/supabase/2026-06-16-multitenancy.sql`

Antes de aplicar migrations em banco com dados reais, confira duplicidades:

```sql
select phone, count(*) from leads group by phone having count(*) > 1;
select campaign_id, lead_id, count(*) from campaign_leads group by campaign_id, lead_id having count(*) > 1;
select whatsapp_message_id, count(*)
from messages
where whatsapp_message_id is not null
group by whatsapp_message_id
having count(*) > 1;
```

## 2. Escolher o modo de deploy

### Modo Free/manual

Use `render.yaml` para validação inicial no plano Free do Render.

Ele cria:

- `thm-connectx-api`: API Express.
- `thm-connectx-panel`: painel React estático.

Neste modo:

- `QUEUE_MODE=manual`.
- Redis não é obrigatório.
- Workers não rodam.
- Campanhas não disparam em segundo plano.
- O envio controlado é feito pelo painel, um lead por vez.
- Webhooks recebidos são processados pela própria API.

### Modo Starter/worker

Use `render.worker.yaml` quando for ativar filas e processamento contínuo.

Ele cria também:

- `thm-connectx-worker`: worker de disparos.
- `thm-connectx-inbound-worker`: worker de mensagens recebidas.

Neste modo:

- `QUEUE_MODE=worker`.
- Redis é obrigatório.
- Disparos e mensagens recebidas passam pelas filas BullMQ.

## 3. Configurar o Render

No Render, crie um Blueprint apontando para o repositório do GitHub.

Para o primeiro teste, use `render.yaml`.

Se criar manualmente, use:

API:

```bash
Build: npm install && npm run build -w server
Start: npm run start -w server
Health Check Path: /health
```

Frontend:

```bash
Build: npm install && npm run build -w client
Publish directory: client/dist
```

Worker de disparos, somente no modo Starter:

```bash
Build: npm install && npm run build -w server
Start: npm run worker -w server
```

Worker inbound, somente no modo Starter:

```bash
Build: npm install && npm run build -w server
Start: npm run inbound-worker
```

## 4. Variáveis de ambiente

Use o arquivo `.env.example` como referência completa.

Na API, configure no mínimo:

- `NODE_ENV=production`
- `QUEUE_MODE=manual` no plano Free ou `QUEUE_MODE=worker` no Starter
- `CLIENT_ORIGIN=https://url-do-painel`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_API_VERSION=v20.0`
- `AI_PROVIDER=gemini` ou `AI_PROVIDER=openai`
- `GEMINI_API_KEY`, se usar Gemini
- `OPENAI_API_KEY`, se usar OpenAI

No frontend, configure:

- `VITE_API_URL=https://url-da-api`

No modo worker, configure também:

- `REDIS_URL`

Para criar o admin inicial por seed, configure temporariamente na API:

- `SEED_TENANT_NAME`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`

## 5. Health check

A API expõe:

```http
GET /health
```

Resposta esperada:

```json
{
  "status": "ok",
  "ts": "2026-06-23T00:00:00.000Z"
}
```

Use essa rota no Render para confirmar que o serviço subiu.

## 6. Criar usuário admin

Depois que as variáveis e o banco estiverem configurados, rode o seed uma vez:

```bash
npx tsx server/scripts/seed.ts
```

O script é idempotente. Se o e-mail já existir, ele apenas informa que o usuário já existe.

Alternativa: criar a primeira conta pelo painel em `Criar conta`.

## 7. Configurar webhook da Meta

No app da Meta:

1. Abra o caso de uso do WhatsApp.
2. Configure a URL de callback:

```text
https://url-da-api/webhooks/whatsapp
```

3. Configure o mesmo valor de `WHATSAPP_VERIFY_TOKEN`.
4. Assine o campo `messages`.
5. Salve e verifique.

Em produção, mantenha `WHATSAPP_APP_SECRET` configurado para validar a assinatura do webhook.

## 8. Verificar Status do Sistema

No painel, abra `Status do Sistema` ou `Configurações` e confirme:

- Supabase conectado.
- Redis conectado, somente no modo worker.
- IA conectada.
- WhatsApp Cloud API conectada.
- Phone Number ID configurado.
- WhatsApp Business Account ID configurado.
- Webhook WhatsApp verificado.
- Worker de disparos rodando, somente no modo worker.
- Worker inbound rodando, somente no modo worker.
- Templates WhatsApp disponíveis.

## 9. Primeiro teste real

1. Cadastre no painel um template aprovado no Gerenciador do WhatsApp.
2. Cadastre um lead de teste com `opt_in_status=authorized`.
3. Crie uma campanha com limite diário baixo.
4. Selecione o template aprovado.
5. No modo Free/manual, envie o próximo lead pelo painel.
6. Responda pelo WhatsApp.
7. Confirme a conversa no painel.
8. Verifique se a IA classifica corretamente e se o handoff para humano aparece quando houver interesse.
