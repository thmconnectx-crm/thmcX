# Deploy Supabase + Render

Este roteiro deixa o ThM ConnectX pronto para teste real controlado.

## 1. Supabase

Para um projeto novo, abra o SQL Editor do Supabase e rode:

```sql
-- cole o conteudo de server/supabase/schema.sql
```

Para um banco que ja recebeu uma versao anterior, rode as migrations nesta ordem:

1. `server/supabase/2026-06-15-connectx-integrations.sql`
2. `server/supabase/2026-06-16-refresh-tokens.sql`
3. `server/supabase/2026-06-16-messages-whatsapp-message-id-unique.sql`
4. `server/supabase/2026-06-16-multitenancy.sql`

Antes da migration de multi-tenancy em banco com dados reais, verifique duplicidades:

```sql
select phone, count(*) from leads group by phone having count(*) > 1;
select campaign_id, lead_id, count(*) from campaign_leads group by campaign_id, lead_id having count(*) > 1;
select whatsapp_message_id, count(*)
from messages
where whatsapp_message_id is not null
group by whatsapp_message_id
having count(*) > 1;
```

## 2. Redis

Crie um Redis externo, por exemplo no Render, Railway ou Upstash. Copie a URL para `REDIS_URL`.

## 3. Render

Use o arquivo `render.yaml` na raiz do projeto como blueprint. Ele cria:

- `thm-connectx-api`: API Express.
- `thm-connectx-worker`: worker de disparos.
- `thm-connectx-inbound-worker`: worker de mensagens recebidas.
- `thm-connectx-panel`: painel React estatico.

Se criar manualmente:

API:

```bash
Build: npm install && npm run build -w server
Start: npm run start -w server
```

Worker de disparos:

```bash
Build: npm install && npm run build -w server
Start: npm run worker -w server
```

Worker inbound:

```bash
Build: npm install && npm run build -w server
Start: npm run inbound-worker
```

Frontend:

```bash
Build: npm install && npm run build -w client
Publish directory: client/dist
```

## 4. Variaveis

Na API:

- `NODE_ENV=production`
- `CLIENT_ORIGIN=https://url-do-painel`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `REDIS_URL`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_API_VERSION=v20.0`
- `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-4.1-mini`

No frontend:

- `VITE_API_URL=https://url-da-api`

Os workers precisam de Supabase, Redis e as credenciais usadas para WhatsApp/OpenAI.

## 5. Primeiro acesso

1. Abra o painel fora de `?preview=1`.
2. Clique em `Criar conta`.
3. Informe nome da empresa, email e senha.
4. A primeira conta criada vira admin do tenant.

## 6. Checklist antes de campanha real

- Status do Sistema sem pendencias criticas.
- Supabase conectado.
- Redis conectado.
- OpenAI conectada.
- WhatsApp Cloud API conectada.
- Phone Number ID e WABA ID configurados.
- Webhook Meta verificado.
- Worker de disparos rodando.
- Worker inbound rodando.
- Template WhatsApp aprovado e cadastrado no painel.
- Lead de teste com `opt_in_status=authorized`.

## 7. Teste controlado

1. Cadastre um template aprovado no painel.
2. Cadastre um lead com opt-in autorizado.
3. Crie uma campanha com limite diario baixo.
4. Inicie a campanha para um unico numero.
5. Responda pelo WhatsApp.
6. Confirme a conversa no painel e o handoff para humano.
