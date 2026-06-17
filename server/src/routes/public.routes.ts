import { Router } from "express";
import { HttpError } from "../http/errors.js";
import { receivePublicLead } from "../services/integration.service.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.post(
  "/leads",
  asyncRoute(async (req, res) => {
    const apiKey = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!apiKey) throw new HttpError(401, "API key ausente");
    const result = await receivePublicLead(apiKey, req.body);
    res.status(201).json({
      success: true,
      lead_id: result.lead_id,
      message: "Lead recebido com sucesso"
    });
  })
);

export default router;
