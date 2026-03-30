// =============================================================================
// src/lib/supabase/service.ts — Service-role Supabase client (server-only)
// Used for storage operations that require elevated permissions.
// =============================================================================

import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
