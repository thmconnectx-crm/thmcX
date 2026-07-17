import OpenAI from "openai";
import { env } from "../config.js";

function getOpenAiClient() {
  if (!env.OPENAI_API_KEY) throw new Error("Configure OPENAI_API_KEY antes de usar respostas com IA.");
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
};

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

export type MarketingReportAnalysis = {
  executive_summary: string;
  health_score: number;
  status: "bom" | "atencao" | "critico" | "sem_dados";
  key_findings: string[];
  alerts: Array<{
    severity: "alta" | "media" | "baixa";
    title: string;
    description: string;
    metric?: string;
  }>;
  recommendations: Array<{
    priority: "alta" | "media" | "baixa";
    title: string;
    action: string;
    expected_impact: string;
  }>;
  next_actions: string[];
  generated_at: string;
  source: "ai" | "heuristic";
  ai_error?: string;
};

const allowedClassifications: AiClassification[] = [
  "interessado",
  "curioso",
  "sem_interesse",
  "opt_out",
  "humano_necessario",
  "respondeu",
  "nao_respondeu"
];

const baseRules = `Você é um pré-atendente da ThM IX Company, empresa especializada em tráfego pago, criação de sites, landing pages, copywriting, criativos e estratégia digital para negócios locais.

Sua função é fazer uma triagem comercial curta, natural e profissional. Você não fecha venda sozinho: você identifica oportunidade real e encaminha para atendimento humano.

Tom:
- direto;
- profissional;
- natural;
- sem parecer robô;
- sem promessas falsas;
- sem textos longos.

Regras obrigatórias:
1. Responda sempre em português do Brasil.
2. Faça apenas uma pergunta por vez.
3. Não seja insistente.
4. Não prometa resultados garantidos.
5. Não invente cases, números ou resultados.
6. Não peça dados sensíveis.
7. Se o lead pedir preço, orçamento, proposta, reunião, diagnóstico, ligação, atendimento ou mais detalhes, sinalize human_needed=true.
8. Se o lead demonstrar dor clara, urgência, interesse real ou intenção de contratar, sinalize human_needed=true.
9. Se o lead disser que não tem interesse, responda com educação, use classification="sem_interesse", human_needed=false e opt_out=false.
10. Se o lead pedir para parar, remover, cancelar, sair ou não receber mensagens, use classification="opt_out", human_needed=false e opt_out=true.
11. Faça no máximo 3 perguntas de diagnóstico no total. Depois disso, se houver qualquer sinal de oportunidade, encaminhe para humano.
12. Ao encaminhar para humano, use uma resposta curta, por exemplo: "Entendi. Faz sentido uma pessoa da equipe continuar com você e avaliar melhor o cenário."

Roteiro de diagnóstico:
- Se o lead disser que ainda não anuncia, pergunte: "Entendi. Hoje os clientes chegam mais por indicação, Instagram, Google ou WhatsApp?"
- Se o lead disser que já anuncia, pergunte: "Boa. Você anuncia mais no Instagram/Facebook ou no Google?"
- Se o lead quiser saber mais, explique brevemente que a ThM IX Company ajuda com tráfego pago, sites, landing pages, copy, criativos e estratégia digital. Depois pergunte qual prioridade ele tem hoje: mais contatos no WhatsApp, melhorar presença online ou vender mais com anúncios.
- Se o lead falar que recebe poucos contatos, considere como dor comercial.
- Se o lead falar que recebe contatos sem qualidade ou que não fecham, considere como dor comercial.
- Se o lead responder algo curto como "sim", "não" ou "talvez", faça uma pergunta simples para entender o cenário, sem pressionar.

Classificações permitidas:
- interessado: há dor, intenção, urgência ou pedido claro de ajuda.
- curioso: quer entender mais, mas ainda não demonstrou intenção forte.
- sem_interesse: recusou sem pedir remoção.
- opt_out: pediu para parar/remover/cancelar/sair/não receber.
- humano_necessario: pediu preço, orçamento, proposta, reunião, diagnóstico, ligação, atendimento, detalhes ou já existe oportunidade real.
- respondeu: resposta neutra que ainda precisa de triagem.
- nao_respondeu: use apenas quando não houver resposta útil.

Retorne apenas JSON válido neste formato:
{
  "reply": "mensagem curta para o lead",
  "classification": "uma das classificações permitidas",
  "human_needed": true ou false,
  "opt_out": true ou false
}`;

const systemPrompt = `${baseRules}

Contexto deste atendimento:
Este lead pode ter vindo de prospecção ativa controlada. Seja respeitoso, breve e pare se não houver interesse.`;

const externalLeadPrompt = `${baseRules}

Contexto deste atendimento:
Este lead veio de uma campanha, formulário, landing page, anúncio, webhook ou API. Portanto, ele já demonstrou algum nível de interesse.

Não trate como lead frio. Não diga que está prospectando. Seja mais consultivo e direto.

Prioridade da triagem:
1. Entender o negócio do lead.
2. Saber se ele já anuncia.
3. Descobrir se quer mais clientes pelo WhatsApp, site ou redes sociais.
4. Identificar urgência.
5. Encaminhar para humano quando houver oportunidade real.`;

export async function generateAiReply(
  history: Array<{ sender_type: string; body: string }>,
  mode: "prospecting" | "external_lead" = "prospecting"
) {
  const messages = history
    .slice(-12)
    .map((message) => `${message.sender_type}: ${message.body}`)
    .join("\n");
  const questionCount = countDiagnosticQuestions(history);
  const latestLeadMessage = [...history].reverse().find((message) => message.sender_type === "lead")?.body ?? "";

  const prompt = `Histórico da conversa:
${messages}

Perguntas de triagem já feitas pela campanha/IA: ${questionCount}.
Se já houver 3 ou mais perguntas e o lead não recusou, encaminhe para humano quando houver qualquer sinal de oportunidade.`;

  const content =
    env.AI_PROVIDER === "gemini"
      ? await generateGeminiJson(mode === "external_lead" ? externalLeadPrompt : systemPrompt, prompt)
      : await generateOpenAiJson(mode === "external_lead" ? externalLeadPrompt : systemPrompt, prompt);
  const parsed = JSON.parse(content) as Partial<AiReply>;
  const forcedHuman = requiresHumanHandoff(latestLeadMessage);
  const optOut = Boolean(parsed.opt_out);
  const humanNeeded = !optOut && (Boolean(parsed.human_needed) || forcedHuman);
  const classification = normalizeClassification(parsed.classification, humanNeeded, optOut);

  return {
    reply: String(parsed.reply ?? "Obrigado pelo retorno. Vou encaminhar para um atendente."),
    classification,
    human_needed: humanNeeded,
    opt_out: optOut
  };
}

export async function generateMarketingReportAnalysis(report: unknown) {
  const system = `Você é um analista sênior de tráfego pago e CRM da ThM IX Company.

Sua função é ler métricas de campanhas, leads, respostas, interessados, handoff humano e custos, e devolver uma análise executiva objetiva.

Regras:
1. Responda em português do Brasil.
2. Não invente dados que não estejam no relatório.
3. Seja direto e acionável.
4. Aponte gargalos, riscos, oportunidades e próximos passos.
5. Dê prioridade para ações que melhorem custo por lead, taxa de resposta, interessados e handoff humano.
6. Se houver poucos dados, diga que a leitura ainda é inicial.
7. Retorne apenas JSON válido.`;

  const prompt = `Analise este relatório de Meta Ads/CRM e gere diagnóstico de performance:

${JSON.stringify(report).slice(0, 22000)}

Formato obrigatório:
{
  "executive_summary": "resumo curto",
  "health_score": 0,
  "status": "bom|atencao|critico|sem_dados",
  "key_findings": ["achado 1"],
  "alerts": [
    {
      "severity": "alta|media|baixa",
      "title": "título",
      "description": "descrição",
      "metric": "métrica relacionada"
    }
  ],
  "recommendations": [
    {
      "priority": "alta|media|baixa",
      "title": "título",
      "action": "ação prática",
      "expected_impact": "impacto esperado"
    }
  ],
  "next_actions": ["ação objetiva para hoje"]
}`;

  const content =
    env.AI_PROVIDER === "gemini"
      ? await generateGeminiJson(system, prompt)
      : await generateOpenAiJson(system, prompt);
  return normalizeMarketingAnalysis(JSON.parse(content) as Partial<MarketingReportAnalysis>, "ai");
}

async function generateOpenAiJson(system: string, prompt: string) {
  const response = await getOpenAiClient().chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt }
    ]
  });

  return response.choices[0]?.message.content ?? "{}";
}

async function generateGeminiJson(system: string, prompt: string) {
  if (!env.GEMINI_API_KEY) throw new Error("Configure GEMINI_API_KEY antes de usar respostas com IA.");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: system }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json"
      }
    })
  });

  const payload = (await response.json()) as GeminiResponse;
  if (!response.ok) throw new Error(payload.error?.message ?? "Falha ao chamar Gemini API.");
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") || "{}";
}

function normalizeClassification(
  classification: Partial<AiReply>["classification"],
  humanNeeded: boolean,
  optOut: boolean
): AiClassification {
  if (optOut) return "opt_out";
  if (humanNeeded) return "humano_necessario";
  if (classification && allowedClassifications.includes(classification)) return classification;
  return "respondeu";
}

function countDiagnosticQuestions(history: Array<{ sender_type: string; body: string }>) {
  return history.filter((message) => ["campaign", "ai"].includes(message.sender_type) && message.body.includes("?")).length;
}

function requiresHumanHandoff(message: string) {
  const normalized = message
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  return [
    "preco",
    "valor",
    "quanto custa",
    "orcamento",
    "proposta",
    "reuniao",
    "diagnostico",
    "ligacao",
    "atendente",
    "atendimento",
    "especialista",
    "consultor",
    "detalhes",
    "quero contratar",
    "tenho interesse",
    "pode me chamar",
    "me chama"
  ].some((term) => normalized.includes(term));
}

function normalizeMarketingAnalysis(
  analysis: Partial<MarketingReportAnalysis>,
  source: MarketingReportAnalysis["source"],
  aiError?: string
): MarketingReportAnalysis {
  const status = ["bom", "atencao", "critico", "sem_dados"].includes(String(analysis.status))
    ? (analysis.status as MarketingReportAnalysis["status"])
    : "atencao";
  const healthScore = Number.isFinite(Number(analysis.health_score))
    ? Math.max(0, Math.min(100, Number(analysis.health_score)))
    : 50;

  return {
    executive_summary: String(analysis.executive_summary ?? "Análise inicial gerada a partir dos dados disponíveis."),
    health_score: healthScore,
    status,
    key_findings: normalizeStringList(analysis.key_findings),
    alerts: normalizeAlerts(analysis.alerts),
    recommendations: normalizeRecommendations(analysis.recommendations),
    next_actions: normalizeStringList(analysis.next_actions),
    generated_at: new Date().toISOString(),
    source,
    ...(aiError ? { ai_error: aiError } : {})
  };
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean).slice(0, 8) : [];
}

function normalizeAlerts(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item) => {
    const alert = item as Record<string, unknown>;
    const severity = ["alta", "media", "baixa"].includes(String(alert.severity)) ? String(alert.severity) : "media";
    return {
      severity: severity as "alta" | "media" | "baixa",
      title: String(alert.title ?? "Ponto de atenção"),
      description: String(alert.description ?? ""),
      ...(alert.metric ? { metric: String(alert.metric) } : {})
    };
  });
}

function normalizeRecommendations(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item) => {
    const recommendation = item as Record<string, unknown>;
    const priority = ["alta", "media", "baixa"].includes(String(recommendation.priority)) ? String(recommendation.priority) : "media";
    return {
      priority: priority as "alta" | "media" | "baixa",
      title: String(recommendation.title ?? "Recomendação"),
      action: String(recommendation.action ?? ""),
      expected_impact: String(recommendation.expected_impact ?? "")
    };
  });
}
