import { Router } from "express";
import {
  convertProspectingCompanyToLead,
  listProspectingCompanies,
  listProspectingSearches,
  prospectingCompanyFiltersSchema,
  prospectingSearchSchema,
  searchProspects
} from "../services/prospecting.service.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.post(
  "/search",
  asyncRoute(async (req, res) => {
    const result = await searchProspects(req.user!.tenantId, prospectingSearchSchema.parse(req.body));
    res.status(201).json(result);
  })
);

router.get(
  "/searches",
  asyncRoute(async (req, res) => {
    res.json(await listProspectingSearches(req.user!.tenantId));
  })
);

router.get(
  "/companies",
  asyncRoute(async (req, res) => {
    res.json(await listProspectingCompanies(req.user!.tenantId, prospectingCompanyFiltersSchema.parse(req.query)));
  })
);

router.post(
  "/companies/:id/convert-to-lead",
  asyncRoute(async (req, res) => {
    res.status(201).json(await convertProspectingCompanyToLead(req.user!.tenantId, req.params.id));
  })
);

export default router;
