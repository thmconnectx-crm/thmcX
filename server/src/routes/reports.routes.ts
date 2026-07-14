import { Router } from "express";
import { getMetaAdsReport, metaAdInsightsInputSchema, saveMetaAdInsights } from "../services/reports.service.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.get(
  "/meta-ads",
  asyncRoute(async (req, res) => {
    res.json(await getMetaAdsReport(req.user!.tenantId));
  })
);

router.post(
  "/meta-ads/insights",
  asyncRoute(async (req, res) => {
    res.status(201).json(await saveMetaAdInsights(req.user!.tenantId, metaAdInsightsInputSchema.parse(req.body)));
  })
);

export default router;
