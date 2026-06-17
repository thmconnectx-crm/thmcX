import { Router } from "express";
import multer from "multer";
import {
  createLead,
  deleteLead,
  importLeadsCsv,
  leadInputSchema,
  leadPatchSchema,
  listLeads,
  updateLead
} from "../services/lead.service.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post(
  "/import",
  upload.single("file"),
  asyncRoute(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Arquivo CSV ausente" });
    const imported = await importLeadsCsv(req.user!.tenantId, req.file.buffer);
    return res.status(201).json({ imported: imported.length, leads: imported });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const lead = await createLead(req.user!.tenantId, leadInputSchema.parse(req.body));
    res.status(201).json(lead);
  })
);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    res.json(
      await listLeads({
        ...req.query,
        tenantId: req.user!.tenantId,
        page: Number(req.query.page ?? 1),
        limit: Number(req.query.limit ?? 50)
      })
    );
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    res.json(await updateLead(req.user!.tenantId, req.params.id, leadPatchSchema.parse(req.body)));
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    await deleteLead(req.user!.tenantId, req.params.id);
    res.status(204).send();
  })
);

export default router;
