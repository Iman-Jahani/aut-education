import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase env vars are missing. Copy .env.local.example to .env.local."
  );
}

// Browser client with a cookie-based session (@supabase/ssr): the same account
// works from any device and `middleware.ts` can read the session server-side.
// NOTE: not using the generic `Database` type here on purpose — the hand-written
// types in ./types.ts are a simplified reference, not a full generated schema,
// and passing them to createClient<Database>() over-constrains query builder
// inference (see ./types.ts for the row shapes used across the app instead).
export const supabase = createBrowserClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

