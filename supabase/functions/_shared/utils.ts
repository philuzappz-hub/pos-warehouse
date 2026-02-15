// supabase/functions/_shared/utils.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "./cors.ts";

export { handleOptions };

export function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,                 // ✅ IMPORTANT: always include CORS
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getSupabaseUrl() {
  return Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
}

function getAnonKey() {
  return Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("ANON_KEY") || "";
}

function getServiceRoleKey() {
  return (
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SERVICE_ROLE_KEY") ||
    ""
  );
}

function getBearer(req: Request) {
  const raw = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!raw.toLowerCase().startsWith("bearer ")) return null;
  const token = raw.slice(7).trim();
  return token.length ? token : null;
}

export function adminClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url) throw new Error("Missing SUPABASE_URL/PROJECT_URL in secrets");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY in secrets");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * ✅ Verify user by asking Supabase Auth (NO local JWT secret needed)
 */
async function getUserFromToken(req: Request) {
  const token = getBearer(req);
  if (!token) {
    return { ok: false as const, status: 401, error: "Missing Authorization: Bearer <token>" };
  }

  const url = getSupabaseUrl();
  const anon = getAnonKey();
  if (!url) return { ok: false as const, status: 500, error: "Missing SUPABASE_URL/PROJECT_URL" };
  if (!anon) return { ok: false as const, status: 500, error: "Missing SUPABASE_ANON_KEY/ANON_KEY" };

  // Create a client that uses the incoming token for auth checks
  const sb = createClient(url, anon, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) {
    return { ok: false as const, status: 401, error: `Invalid session: ${error?.message ?? "No user"}` };
  }

  return { ok: true as const, token, userId: data.user.id };
}

export async function requireAdmin(req: Request) {
  const v = await getUserFromToken(req);
  if (!v.ok) return v;

  const sbAdmin = adminClient();

  // Read profile with SERVICE ROLE (bypasses RLS, server-side only)
  const { data: profile, error } = await sbAdmin
    .from("profiles")
    .select("user_id, role, is_admin, company_id, deleted_at")
    .eq("user_id", v.userId)
    .maybeSingle();

  if (error) return { ok: false as const, status: 500, error: error.message };
  if (!profile) return { ok: false as const, status: 403, error: "Profile not found" };
  if ((profile as any).deleted_at) return { ok: false as const, status: 403, error: "Account is deleted/disabled" };

  const isAdmin = profile.role === "admin" || profile.is_admin === true;
  if (!isAdmin) return { ok: false as const, status: 403, error: "Admins only" };

  const companyId = (profile as any).company_id ?? null;
  if (!companyId) return { ok: false as const, status: 400, error: "Missing company_id (complete setup first)" };

  return { ok: true as const, jwt: v.token, userId: v.userId, companyId };
}
