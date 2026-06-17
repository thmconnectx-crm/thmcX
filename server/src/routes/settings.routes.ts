import { Router } from "express";
import { getSetupStatus, testSetupCheck } from "../services/setup.service.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.get(
  "/status",
  asyncRoute(async (req, res) => {
    res.json(await getSetupStatus(req.user!.tenantId));
  })
);

router.post(
  "/status/:key/test",
  asyncRoute(async (req, res) => {
    res.json(await testSetupCheck(req.user!.tenantId, req.params.key));
  })
);

export default router;
