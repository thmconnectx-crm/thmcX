# API MVP

Todas as rotas abaixo, exceto `/auth/login`, `/health` e `/webhooks/whatsapp`, exigem:

```http
Authorization: Bearer <token>
```

## Auth

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@thmixcompany.com",
  "password": "senha"
}
```

## Leads

CSV aceito em `/leads/import` com `multipart/form-data` campo `file`.

Colunas aceitas em PT-BR ou EN:

- `nome` ou `name`
- `telefone` ou `phone`
- `empresa` ou `company`
- `cidade` ou `city`
- `nicho` ou `niche`
- `origem` ou `source`
- `status`
- `tags` separadas por vírgula
- `observacoes` ou `observations`

```http
POST /leads
{
  "name": "Maria",
  "phone": "556599999999",
  "company": "Studio Local",
  "city": "Cuiaba",
  "niche": "beleza",
  "source": "indicacao",
  "tags": ["beleza", "cuiaba"]
}
```

Filtros:

```http
GET /leads?city=Cuiaba&niche=beleza&tag=cuiaba&status=novo
```

## Campanhas

Campanhas de primeira abordagem usam template oficial do WhatsApp. `message_body` e usado como preview interno e histórico, não como texto livre enviado pela Cloud API.

```http
POST /campaigns
{
  "name": "Beleza Cuiaba",
  "message_body": "Olá, Maria. Recebi seu cadastro sobre captação de clientes pela internet...",
  "template_id": "uuid-do-template-aprovado",
  "template_variables": ["[nome]"],
  "daily_limit": 30,
  "interval_min_seconds": 90,
  "interval_max_seconds": 240,
  "allowed_start_time": "09:00",
  "allowed_end_time": "18:00",
  "filters": {
    "city": "Cuiaba",
    "niche": "beleza",
    "tag": "cuiaba"
  }
}
```

Leads so entram em campanhas quando `opt_out=false` e `opt_in_status=authorized`.

Acionamento:

```http
POST /campaigns/:id/start
POST /campaigns/:id/pause
POST /campaigns/:id/stop
```

## Conversas

```http
GET /conversations
GET /conversations/:id
POST /conversations/:id/takeover
POST /conversations/:id/enable-ai
POST /conversations/:id/disable-ai
POST /conversations/:id/send
POST /conversations/:id/mark
```

Enviar mensagem humana:

```http
POST /conversations/:id/send
{
  "body": "Claro. Posso te mandar algumas opcoes de horários?"
}
```

Marcar status:

```http
POST /conversations/:id/mark
{
  "status": "interessado"
}
```

Valores aceitos: `interessado`, `sem_interesse`, `humano_necessário`, `opt_out`.

## Webhook WhatsApp

Verificacao Meta:

```http
GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<challenge>
```

Recebimento:

```http
POST /webhooks/whatsapp
```

O webhook registra mensagens inbound, atualiza status de mensagens por `whatsapp_message_id`, detecta opt-out e chama IA quando a conversa permite.

## Conexões Externas

Listar fontes:

```http
GET /integrations
```

Criar fonte:

```http
POST /integrations
{
  "name": "Landing Page - Diagnostico Gratuito",
  "type": "landing_page",
  "status": "active",
  "settings": {
    "auto_ai_enabled": true,
    "send_first_message": true,
    "auto_tag": "diagnóstico_trafego",
    "initial_status": "novo_lead_ads",
    "first_message_body": "Olá, [nome]. Tudo bem?\n\nRecebi seu cadastro sobre captação de clientes pela internet.\n\nPara eu entender melhor: hoje você já anuncia no Google, Instagram ou Facebook?"
  }
}
```

Atualizar, desativar e testar:

```http
PATCH /integrations/:sourceId
DELETE /integrations/:sourceId
POST /integrations/:sourceId/test
GET /integrations/dashboard
```

Receber lead por webhook:

```http
POST /integrations/webhook/:sourceId
X-API-Key: <api_key_da_fonte>

{
  "name": "Nome do Lead",
  "phone": "66999999999",
  "email": "email@email.com",
  "company": "Empresa",
  "city": "Sinop",
  "niche": "Barbearia",
  "utm_source": "meta",
  "utm_medium": "paid",
  "utm_campaign": "campanha_x",
  "utm_content": "criativo_1",
  "utm_term": "barbearia"
}
```

API pública:

```http
POST /public/leads
Authorization: Bearer API_KEY

{
  "name": "Nome do Lead",
  "phone": "66999999999",
  "email": "email@email.com",
  "company": "Empresa",
  "city": "Sinop",
  "niche": "Barbearia",
  "utm_source": "meta",
  "utm_medium": "paid",
  "utm_campaign": "campanha_x",
  "utm_content": "criativo_1",
  "utm_term": "barbearia"
}
```

Resposta:

```json
{
  "success": true,
  "lead_id": "...",
  "message": "Lead recebido com sucesso"
}
```

O processamento salva `incoming_leads`, registra `integration_logs`, normaliza telefone, deduplica por telefone, cria histórico em `lead_source_history`, cria conversa e aplica automações da fonte.

## Templates WhatsApp

```http
GET /templates
POST /templates
PATCH /templates/:id
DELETE /templates/:id
```

Criar template:

```http
POST /templates
{
  "name": "Primeiro contato - diagnóstico",
  "whatsapp_template_name": "diagnóstico_primeiro_contato",
  "language_code": "pt_BR",
  "category": "MARKETING",
  "body_preview": "Olá, {{1}}. Recebi seu cadastro sobre captação de clientes pela internet.",
  "variables": ["[nome]"],
  "status": "approved"
}
```

`status=approved` deve refletir a aprovacao real no WhatsApp Manager.

## Setup

```http
GET /settings/status
POST /settings/status/:key/test
```

Retorna o checklist usado no painel com status detalhado:

- Supabase conectado
- Redis conectado
- OpenAI conectado
- WhatsApp Cloud API conectada
- Phone Number ID configurado
- Webhook verificado
- Worker de disparos rodando
- Dados reais ativos

Formato:

```json
{
  "checks": [
    {
      "key": "supabase_connected",
      "label": "Supabase conectado",
      "status": "connected",
      "message": "Banco respondeu com sucesso."
    }
  ]
}
```

`status` pode ser `connected`, `pending` ou `error`.
