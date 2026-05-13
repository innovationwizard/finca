// =============================================================================
// One-shot: seed Manuel Flores as ADMIN user.
// Run: npx tsx scripts/seed-manuel-flores.ts
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

const EMAIL    = "manuel.flores@fincadanilandia.com.gt";
const PASSWORD = "TempDanilandia2026";
const NAME     = "Manuel Flores";
const ROLE     = "ADMIN";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Guard: don't create duplicates
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.log(`User already exists: ${existing.email} (${existing.role})`);
    process.exit(0);
  }

  // 1. Create in Supabase Auth (email pre-confirmed)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });

  if (authError) {
    console.error("Supabase auth error:", authError.message);
    process.exit(1);
  }

  // 2. Create in users table
  const user = await prisma.user.create({
    data: {
      supabaseId: authData.user.id,
      email: EMAIL,
      name: NAME,
      role: ROLE,
    },
  });

  console.log(`Created: ${user.name} <${user.email}> — ${user.role} (${user.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
