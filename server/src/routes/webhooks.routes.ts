import { Router, type Request } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config.js";
import { supabase } from "../db.js";
import { inboundQueue } from "../queues/inboundQueue.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post(
  "/whatsapp",
  asyncRoute(async (req, res) => {
    if (!isValidMetaSignature(req)) return res.sendStatus(403);

    const entries = req.body?.entry ?? [];

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value;

        for (const status of value?.statuses ?? []) {
          await supabase
            .from("messages")
            .update({ status: status.status })
            .eq("whatsapp_message_id", status.id);
        }

        for (const message of value?.messages ?? []) {
          const from = message.from as string | undefined;
          const body = message.text?.body as string | undefined;
          if (from && body) {
            await inboundQueue.add(
              `inbound:${message.id ?? `${from}:${Date.now()}`}`,
              { from, body, whatsappMessageId: message.id },
              { jobId: message.id ? `whatsapp:${message.id}` : undefined }
            );
          }
        }
      }
    }

    res.sendStatus(200);
  })
);

function isValidMetaSignature(req: Request) {
  if (!env.WHATSAPP_APP_SECRET) {
    console.warn("WHATSAPP_APP_SECRET nao configurado; assinatura do webhook Meta nao sera validada.");
    return env.NODE_ENV !== "production";
  }

  const header = req.header("x-hub-signature-256");
  const rawBody = req.rawBody;
  if (!header || !rawBody) return false;

  const received = header.replace(/^sha256=/, "");
  const expected = createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody).digest("hex");
  const receivedBuffer = Buffer.from(received, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export default router;
