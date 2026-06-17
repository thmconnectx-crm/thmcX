import { Router } from "express";
import { z } from "zod";
import {
  getConversation,
  listConversations,
  markConversation,
  sendHumanMessage,
  setAiEnabled,
  takeoverConversation
} from "../services/conversation.service.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.get(
  "/",
  asyncRoute(async (req, res) => {
    res.json(await listConversations(req.user!.tenantId));
  })
);

router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    res.json(await getConversation(req.user!.tenantId, req.params.id));
  })
);

router.post(
  "/:id/send",
  asyncRoute(async (req, res) => {
    const { body } = z.object({ body: z.string().min(1).max(1200) }).parse(req.body);
    res.status(201).json(await sendHumanMessage(req.user!.tenantId, req.params.id, body));
  })
);

router.post(
  "/:id/takeover",
  asyncRoute(async (req, res) => {
    res.json(await takeoverConversation(req.user!.tenantId, req.params.id, req.user!.id));
  })
);

router.post(
  "/:id/enable-ai",
  asyncRoute(async (req, res) => {
    res.json(await setAiEnabled(req.user!.tenantId, req.params.id, true));
  })
);

router.post(
  "/:id/disable-ai",
  asyncRoute(async (req, res) => {
    res.json(await setAiEnabled(req.user!.tenantId, req.params.id, false));
  })
);

router.post(
  "/:id/mark",
  asyncRoute(async (req, res) => {
    const { status } = z
      .object({ status: z.enum(["interessado", "sem_interesse", "humano_necessario", "opt_out"]) })
      .parse(req.body);
    res.json(await markConversation(req.user!.tenantId, req.params.id, status));
  })
);

export default router;
