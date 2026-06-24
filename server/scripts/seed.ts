import "dotenv/config";
import bcrypt from "bcryptjs";
import { env } from "../src/config.js";
import { assertDb, supabase } from "../src/db.js";

async function main() {
  const email = env.SEED_ADMIN_EMAIL.trim().toLowerCase();
  const password = env.SEED_ADMIN_PASSWORD;
  const tenantName = env.SEED_TENANT_NAME.trim() || "ThM ConnectX";

  if (!email || !password) {
    throw new Error("Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD antes de rodar o seed.");
  }

  if (password.length < 8) {
    throw new Error("SEED_ADMIN_PASSWORD precisa ter pelo menos 8 caracteres.");
  }

  const existingUser = await supabase.from("users").select("id").eq("email", email).maybeSingle();
  if (existingUser.error) throw new Error(existingUser.error.message);

  if (existingUser.data) {
    console.log(`Usuario admin ${email} ja existe.`);
    return;
  }

  const tenant = assertDb(
    await supabase
      .from("tenants")
      .insert({ name: tenantName, plan: "free" })
      .select("id")
      .single()
  ) as { id: string };

  const passwordHash = await bcrypt.hash(password, 12);

  await supabase
    .from("users")
    .insert({
      tenant_id: tenant.id,
      email,
      name: "Administrador",
      password_hash: passwordHash,
      role: "admin"
    })
    .throwOnError();

  console.log(`Usuario admin ${email} criado com sucesso.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  console.error(`Seed failed: ${message}`);
  process.exit(1);
});
