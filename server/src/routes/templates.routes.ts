import { Router } from "express";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  templateInputSchema,
  templatePatchSchema,
  updateTemplate
} from "../services/template.service.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.get(
  "/",
  asyncRoute(async (req, res) => {
    res.json(await listTemplates(req.user!.tenantId));
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    res.status(201).json(await createTemplate(req.user!.tenantId, templateInputSchema.parse(req.body)));
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    res.json(await updateTemplate(req.user!.tenantId, req.params.id, templatePatchSchema.parse(req.body)));
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    await deleteTemplate(req.user!.tenantId, req.params.id);
    res.status(204).send();
  })
);

export default router;
