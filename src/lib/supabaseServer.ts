// Cookie-based Supabase client for route handlers / server code.
// Shared by /api/ai-hint and /api/battle/* so there is one definition.
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function serverSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );
}
