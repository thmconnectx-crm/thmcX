import OpenAI from "openai";
import { env } from "../config.js";

function getOpenAiClient() {
  if (!env.OPENAI_API_KEY) throw new Error("Configure OPENAI_API_KEY antes de usar respostas com IA.");
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

export type AiClassification =
  | "interessado"
  | "curioso"
  | "sem_interesse"
  | "opt_out"
  | "humano_necessario"
  | "respondeu"
  | "nao_respondeu";

export type AiReply = {
  reply: string;
  classification: AiClassification;
  human_needed: boolean;
  opt_out: boolean;
};

const systemPrompt = `Você é um pré-atendente da ThM IX Company, empresa especializada em tráfego pago, criação de sites, landing pages, copywriting, criativos e estratégia digital para negócios locais.

Seu objetivo é conversar de forma breve com leads comerciais, entender se existe interesse e encaminhar para atendimento humano quando houver oportunidade real.

Regras:
1. Não seja insistente.
2. Não prometa resultados garantidos.
3. Não invente cases.
4. Não envie mensagens longas.
5. Faça apenas uma pergunta por vez.
6. Se o lead demonstrar interesse, sinalize human_needed=true.
7. Se o lead pedir preço, diagnóstico, reunião ou mais detalhes, sinalize human_needed=true.
8. Se o lead disser que não tem interesse, encerre com educação.
9. Se o lead pedir para parar, sinalize opt_out=true.
10. Sempre responda em português do Brasil.

Retorne apenas JSON válido com: reply, classification, human_needed, opt_out.`;

const externalLeadPrompt = `Você é um pré-atendente da ThM IX Company.

Este lead veio de uma campanha, formulário, landing page ou anúncio. Portanto, ele demonstrou algum nível de interesse.

Seu objetivo é iniciar um atendimento consultivo e rápido, entender a necessidade do lead e encaminhar para atendimento humano quando houver oportunidade.

Não seja frio. Não diga que está prospectando. Não prometa resultado garantido. Não envie textos longos.

Faça uma pergunta por vez.

Objetivo da triagem:
1. Entender o negócio do lead.
2. Saber se ele já anuncia.
3. Descobrir se quer mais clientes pelo WhatsApp, site ou redes sociais.
4. Identificar urgência.
5. Encaminhar para humano se houver interesse real.

Se o lead pedir preço, reunião, diagnóstico, orçamento ou proposta, sinalize human_needed=true.

Retorne apenas JSON válido com: reply, classification, human_needed, opt_out.`;

export async function generateAiReply(
  history: Array<{ sender_type: string; body: string }>,
  mode: "prospecting" | "external_lead" = "prospecting"
) {
  const messages = history
    .slice(-12)
    .map((message) => `${message.sender_type}: ${message.body}`)
    .join("\n");

  const response = await getOpenAiClient().chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: mode === "external_lead" ? externalLeadPrompt : systemPrompt },
      { role: "user", content: `Histórico da conversa:\n${messages}` }
    ]
  });

  const content = response.choices[0]?.message.content ?? "{}";
  const parsed = JSON.parse(content) as Partial<AiReply>;

  return {
    reply: String(parsed.reply ?? "Obrigado pelo retorno. Vou encaminhar para um atendente."),
    classification: (parsed.classification ?? "respondeu") as AiClassification,
    human_needed: Boolean(parsed.human_needed),
    opt_out: Boolean(parsed.opt_out)
  };
}
