import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config.js";
import { HttpError } from "./errors.js";

export type AuthUser = {
  id: string;
  userId: string;
  tenantId: string;
  role: "admin" | "agent";
  email?: string;
  name?: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, "Token ausente"));

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as Partial<AuthUser> & {
      tenant_id?: string;
      user_id?: string;
    };
    const userId = payload.userId ?? payload.user_id ?? payload.id;
    const tenantId = payload.tenantId ?? payload.tenant_id;
    const role = payload.role;
    if (!userId || !tenantId || (role !== "admin" && role !== "agent")) {
      return next(new HttpError(401, "Token invalido"));
    }
    req.user = {
      ...payload,
      id: userId,
      userId,
      tenantId,
      role
    };
    return next();
  } catch {
    return next(new HttpError(401, "Token invalido"));
  }
}

export function requireRole(role: AuthUser["role"]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, "Token ausente"));
    if (req.user.role !== role) return next(new HttpError(403, "Permissao insuficiente"));
    return next();
  };
}
