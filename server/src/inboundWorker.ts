import { Worker } from "bullmq";
import { supabase } from "./db.js";
import { redisConnection } from "./queues/connection.js";
import type { InboundMessageJob } from "./queues/inboundQueue.js";
import { handleInboundMessage } from "./services/conversation.service.js";

async function writeInboundWorkerHeartbeat() {
  await supabase.from("settings").upsert(
    {
      key: "inbound_worker_heartbeat",
      value: { updated_at: new Date().toISOString(), queue: "inbound-messages" }
    },
    { onConflict: "key" }
  );
}

void writeInboundWorkerHeartbeat().catch((error) => console.error("Inbound worker heartbeat failed:", error.message));
setInterval(() => {
  void writeInboundWorkerHeartbeat().catch((error) => console.error("Inbound worker heartbeat failed:", error.message));
}, 30000);

export const inboundWorker = new Worker<InboundMessageJob, unknown, string>(
  "inbound-messages",
  async (job) => {
    const { from, body, whatsappMessageId } = job.data;
    return handleInboundMessage(from, body, whatsappMessageId);
  },
  { connection: redisConnection, concurrency: 5 }
);

inboundWorker.on("failed", (_job, error) => {
  console.error("Inbound message job failed:", error.message);
});
