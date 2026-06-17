import { env } from "../config.js";

type WhatsAppSendResult = {
  id: string;
};

type TemplateVariable = string | number | boolean;

export async function sendWhatsAppText(to: string, body: string): Promise<WhatsAppSendResult> {
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body }
    })
  });

  const payload = (await response.json()) as {
    messages?: Array<{ id: string }>;
    error?: { message: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Falha ao enviar mensagem pelo WhatsApp");
  }

  const id = payload.messages?.[0]?.id;
  if (!id) throw new Error("WhatsApp nao retornou id da mensagem");
  return { id };
}

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  variables: TemplateVariable[] = []
): Promise<WhatsAppSendResult> {
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const components = variables.length
    ? [
        {
          type: "body",
          parameters: variables.map((value) => ({
            type: "text",
            text: String(value)
          }))
        }
      ]
    : undefined;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {})
      }
    })
  });

  const payload = (await response.json()) as {
    messages?: Array<{ id: string }>;
    error?: { message: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Falha ao enviar template pelo WhatsApp");
  }

  const id = payload.messages?.[0]?.id;
  if (!id) throw new Error("WhatsApp nao retornou id da mensagem");
  return { id };
}
