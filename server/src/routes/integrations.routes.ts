import { Router } from "express";
import { requireAuth } from "../http/auth.js";
import {
  createLeadSource,
  deleteLeadSource,
  getConnectionsDashboard,
  leadSourcePatchSchema,
  leadSourceSchema,
  listLeadSources,
  receiveWebhookLead,
  testLeadSource,
  updateLeadSource
} from "../services/integration.service.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.post(
  "/webhook/:sourceId",
  asyncRoute(async (req, res) => {
    const apiKey = req.header("x-api-key") ?? req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const result = await receiveWebhookLead(req.params.sourceId, req.body, apiKey);
    res.status(201).json(result);
  })
);

router.get(
  "/dashboard",
  requireAuth,
  asyncRoute(async (req, res) => {
    res.json(await getConnectionsDashboard(req.user!.tenantId));
  })
);

router.get(
  "/",
  requireAuth,
  asyncRoute(async (req, res) => {
    res.json(await listLeadSources(req.user!.tenantId));
  })
);

router.post(
  "/",
  requireAuth,
  asyncRoute(async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.status(201).json(await createLeadSource(req.user!.tenantId, leadSourceSchema.parse(req.body), baseUrl));
  })
);

router.patch(
  "/:sourceId",
  requireAuth,
  asyncRoute(async (req, res) => {
    res.json(await updateLeadSource(req.user!.tenantId, req.params.sourceId, leadSourcePatchSchema.parse(req.body)));
  })
);

router.delete(
  "/:sourceId",
  requireAuth,
  asyncRoute(async (req, res) => {
    res.json(await deleteLeadSource(req.user!.tenantId, req.params.sourceId));
  })
);

router.post(
  "/:sourceId/test",
  requireAuth,
  asyncRoute(async (req, res) => {
    res.json(await testLeadSource(req.user!.tenantId, req.params.sourceId));
  })
);

export default router;
