import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { env } from "../config.js";
import { assertDb, supabase } from "../db.js";
import { HttpError } from "../http/errors.js";

const accessTokenTtl = "15m";
const refreshTokenMs = 7 * 24 * 60 * 60 * 1000;

export type AuthRole = "admin" | "agent";

export type AccessTokenPayload = {
  userId: string;
  tenantId: string;
  role: AuthRole;
  email: string;
  id: string;
};

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  tenantName: z.string().min(1),
  name: z.string().optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const refreshSchema = z.object({ refresh_token: z.string().min(40) });
export const logoutSchema = refreshSchema;

type UserRow = {
  id: string;
  tenant_id: string;
  email: string;
  name?: string | null;
  password_hash: string;
  role: AuthRole;
};

export async function register(email: string, password: string, tenantName: string, name?: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const tenant = assertDb(
    await supabase.from("tenants").insert({ name: tenantName }).select("*").single()
  ) as { id: string; name: string };

  const user = assertDb(
    await supabase
      .from("users")
      .insert({
        tenant_id: tenant.id,
        email,
        name: name ?? email.split("@")[0],
        password_hash: passwordHash,
        role: "admin"
      })
      .select("*")
      .single()
  ) as UserRow;

  return issueSession(user);
}

export async function login(email: string, password: string) {
  const result = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new HttpError(401, "Credenciais invalidas");

  const user = result.data as UserRow;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new HttpError(401, "Credenciais invalidas");

  return issueSession(user);
}

export async function refreshToken(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  const result = await supabase
    .from("refresh_tokens")
    .select("*, users(*)")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new HttpError(401, "Refresh token invalido");

  const session = result.data as { expires_at: string; users: UserRow | null };
  if (!session.users || new Date(session.expires_at).getTime() < Date.now()) {
    throw new HttpError(401, "Refresh token expirado");
  }

  return {
    token: signAccessToken(session.users),
    user: toPublicUser(session.users)
  };
}

export async function logout(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  await supabase.from("refresh_tokens").delete().eq("token_hash", tokenHash);
  return { success: true };
}

function issueSession(user: UserRow) {
  const refreshTokenValue = randomBytes(40).toString("hex");
  const tokenHash = hashToken(refreshTokenValue);
  const expiresAt = new Date(Date.now() + refreshTokenMs).toISOString();

  return supabase
    .from("refresh_tokens")
    .insert({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt })
    .then((result) => {
      if (result.error) throw new Error(result.error.message);
      return {
        token: signAccessToken(user),
        refresh_token: refreshTokenValue,
        user: toPublicUser(user)
      };
    });
}

function signAccessToken(user: UserRow) {
  const payload: AccessTokenPayload = {
    userId: user.id,
    tenantId: user.tenant_id,
    role: user.role,
    email: user.email,
    id: user.id
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: accessTokenTtl });
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function toPublicUser(user: UserRow) {
  return {
    id: user.id,
    userId: user.id,
    tenantId: user.tenant_id,
    email: user.email,
    name: user.name ?? user.email,
    role: user.role
  };
}
