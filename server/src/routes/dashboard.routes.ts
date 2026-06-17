import { Router } from "express";
import { getDashboard } from "../services/dashboard.service.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.get(
  "/",
  asyncRoute(async (req, res) => {
    res.json(await getDashboard(req.user!.tenantId));
  })
);

export default router;
