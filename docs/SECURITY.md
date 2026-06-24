# Segurança operacional

Checklist mínimo antes de usar o ThM ConnectX com leads reais.

## Variáveis e segredos

- Nunca coloque tokens reais no código, no GitHub ou em prints.
- Configure segredos somente no Render ou no ambiente local `.env`.
- Em produção, troque todos os valores `replace-me`.
- Use um `JWT_SECRET` longo e exclusivo.
- Configure `WHATSAPP_APP_SECRET`; sem ele o webhook da Meta não deve rodar em produção.
- Restrinja `CLIENT_ORIGIN` para a URL pública do painel. Para mais de uma origem, separe por vírgula.

## WhatsApp e webhooks

- Use somente WhatsApp Cloud API oficial.
- Mantenha o webhook Meta com assinatura `x-hub-signature-256`.
- Assine apenas os campos necessários, principalmente `messages`.
- Não use token temporário em produção; use token permanente/sistema quando a conta estiver pronta.

## Leads e integrações

- Toda fonte externa deve ter `api_key`.
- Webhooks externos precisam enviar `X-API-Key` ou `Authorization: Bearer API_KEY`.
- Não aceite leads sem origem registrada.
- Mantenha opt-in e opt-out ativos antes de disparar campanha.

## Operação

- Rode `npm run typecheck` e `npm run build` antes de deploy.
- Confira `/health` após cada deploy.
- Confira a tela `Status do Sistema` antes de campanha real.
- Revogue e gere novos tokens se algum segredo for exposto.

## Logs

- Não registre tokens em query string.
- Não compartilhe logs brutos publicamente.
- Em produção, erros internos devem ficar no servidor e não na resposta da API.
