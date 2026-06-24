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
const heartbeatInterval = setInterval(() => {
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

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received. Closing inbound worker...`);
  clearInterval(heartbeatInterval);

  const timeout = setTimeout(() => {
    console.error("Inbound worker shutdown timeout reached. Exiting.");
    process.exit(1);
  }, 10000);
  timeout.unref();

  try {
    await inboundWorker.close();
    clearTimeout(timeout);
    console.log("Inbound worker closed.");
    process.exit(0);
  } catch (error) {
    console.error("Inbound worker shutdown failed:", error);
    process.exit(1);
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
