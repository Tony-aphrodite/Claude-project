// Server-side Supabase client. We use the SSR helper so cookies (auth) get
// forwarded properly between client and server components.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieEntry = { name: string; value: string; options?: CookieOptions };

export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (entries: CookieEntry[]) => {
          for (const { name, value, options } of entries) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );
}

export async function requireUser() {
  const sb = await getSupabaseServer();
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}
