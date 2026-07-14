import { Router } from "express";
import { getMetaAdsReport } from "../services/reports.service.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.get(
  "/meta-ads",
  asyncRoute(async (req, res) => {
    res.json(await getMetaAdsReport(req.user!.tenantId));
  })
);

export default router;
