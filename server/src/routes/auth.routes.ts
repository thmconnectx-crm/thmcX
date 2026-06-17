import { Router } from "express";
import {
  login,
  loginSchema,
  logout,
  logoutSchema,
  refreshSchema,
  refreshToken,
  register,
  registerSchema
} from "../services/auth.service.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.post(
  "/register",
  asyncRoute(async (req, res) => {
    const input = registerSchema.parse(req.body);
    res.status(201).json(await register(input.email, input.password, input.tenantName, input.name));
  })
);

router.post(
  "/login",
  asyncRoute(async (req, res) => {
    const input = loginSchema.parse(req.body);
    res.json(await login(input.email, input.password));
  })
);

router.post(
  "/refresh",
  asyncRoute(async (req, res) => {
    const input = refreshSchema.parse(req.body);
    res.json(await refreshToken(input.refresh_token));
  })
);

router.post(
  "/logout",
  asyncRoute(async (req, res) => {
    const input = logoutSchema.parse(req.body);
    res.json(await logout(input.refresh_token));
  })
);

export default router;
