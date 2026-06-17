import { Router } from "express";
import {
  campaignInputSchema,
  campaignPatchSchema,
  createCampaign,
  getCampaign,
  listCampaigns,
  setCampaignStatus,
  startCampaign,
  updateCampaign
} from "../services/campaign.service.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.post(
  "/",
  asyncRoute(async (req, res) => {
    res.status(201).json(await createCampaign(req.user!.tenantId, campaignInputSchema.parse(req.body)));
  })
);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    res.json(await listCampaigns(req.user!.tenantId));
  })
);

router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    res.json(await getCampaign(req.user!.tenantId, req.params.id));
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    res.json(await updateCampaign(req.user!.tenantId, req.params.id, campaignPatchSchema.parse(req.body)));
  })
);

router.post(
  "/:id/start",
  asyncRoute(async (req, res) => {
    res.json(await startCampaign(req.user!.tenantId, req.params.id));
  })
);

router.post(
  "/:id/pause",
  asyncRoute(async (req, res) => {
    res.json(await setCampaignStatus(req.user!.tenantId, req.params.id, "paused"));
  })
);

router.post(
  "/:id/stop",
  asyncRoute(async (req, res) => {
    res.json(await setCampaignStatus(req.user!.tenantId, req.params.id, "stopped"));
  })
);

export default router;
