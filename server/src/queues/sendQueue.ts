import { Queue } from "bullmq";
import { redisConnection } from "./connection.js";

export type SendJob = {
  tenantId?: string;
  campaignId: string;
  campaignLeadId: string;
  leadId: string;
};

export const sendQueue = new Queue<SendJob, unknown, string>("campaign-send", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: 1000,
    removeOnFail: 1000
  }
});
