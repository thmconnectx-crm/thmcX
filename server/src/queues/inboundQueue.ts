import { Queue } from "bullmq";
import { redisConnection } from "./connection.js";

export type InboundMessageJob = {
  from: string;
  body: string;
  whatsappMessageId?: string;
};

export const inboundQueue = new Queue<InboundMessageJob, unknown, string>("inbound-messages", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000
    },
    removeOnComplete: 1000,
    removeOnFail: 1000
  }
});
