import { Router } from "express";
import { getSetupStatus, testSetupGroup } from "../services/setup.service.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.get(
  "/status",
  asyncRoute(async (req, res) => {
    res.json(await getSetupStatus(req.user!.tenantId));
  })
);

router.post(
  "/test/supabase",
  asyncRoute(async (req, res) => {
    res.json(await testSetupGroup(req.user!.tenantId, "supabase"));
  })
);

router.post(
  "/test/redis",
  asyncRoute(async (req, res) => {
    res.json(await testSetupGroup(req.user!.tenantId, "redis"));
  })
);

router.post(
  "/test/openai",
  asyncRoute(async (req, res) => {
    res.json(await testSetupGroup(req.user!.tenantId, "openai"));
  })
);

router.post(
  "/test/whatsapp",
  asyncRoute(async (req, res) => {
    res.json(await testSetupGroup(req.user!.tenantId, "whatsapp", typeof req.body?.key === "string" ? req.body.key : undefined));
  })
);

router.post(
  "/test/worker",
  asyncRoute(async (req, res) => {
    res.json(await testSetupGroup(req.user!.tenantId, "worker"));
  })
);

export default router;
