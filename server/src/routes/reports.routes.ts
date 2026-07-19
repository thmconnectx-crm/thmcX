import { Router } from "express";
import { getMetaAdsAiAnalysis, getMetaAdsReport, metaAdInsightsInputSchema, saveMetaAdInsights } from "../services/reports.service.js";
import {
  getReportMonitorStatus,
  listReportNotifications,
  markReportNotificationRead
} from "../services/report-monitor.service.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.get(
  "/meta-ads",
  asyncRoute(async (req, res) => {
    res.json(await getMetaAdsReport(req.user!.tenantId));
  })
);

router.get(
  "/meta-ads/analysis",
  asyncRoute(async (req, res) => {
    res.json(await getMetaAdsAiAnalysis(req.user!.tenantId));
  })
);

router.get(
  "/notifications",
  asyncRoute(async (req, res) => {
    res.json(await listReportNotifications(req.user!.tenantId));
  })
);

router.get(
  "/monitor/status",
  asyncRoute(async (req, res) => {
    res.json(await getReportMonitorStatus(req.user!.tenantId));
  })
);

router.patch(
  "/notifications/:id/read",
  asyncRoute(async (req, res) => {
    res.json(await markReportNotificationRead(req.user!.tenantId, req.params.id));
  })
);

router.post(
  "/meta-ads/insights",
  asyncRoute(async (req, res) => {
    res.status(201).json(await saveMetaAdInsights(req.user!.tenantId, metaAdInsightsInputSchema.parse(req.body)));
  })
);

export default router;
