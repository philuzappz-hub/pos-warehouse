import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Claims = {
  sub?: string; // user id
  email?: string;
};

export async function requireUser(req: Request) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) {
    return { error: new Response(JSON.stringify({ message: "Missing Authorization header" }), { status: 401 }) };
  }

  const [bearer, token] = authHeader.split(" ");
  if (bearer !== "Bearer" || !token) {
    return { error: new Response(JSON.stringify({ message: "Auth header must be: Bearer <token>" }), { status: 401 }) };
  }

  // IMPORTANT: use project env vars (Edge secrets)
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    return { error: new Response(JSON.stringify({ message: "Missing SUPABASE_URL / SUPABASE_ANON_KEY" }), { status: 500 }) };
  }

  // This uses Supabase Auth to validate claims (works with JWT Signing Keys)
  const authClient = createClient(url, anonKey);

  const { data, error } = await authClient.auth.getClaims(token);
  const claims = (data?.claims || {}) as Claims;

  if (error || !claims?.sub) {
    return { error: new Response(JSON.stringify({ message: "Invalid JWT" }), { status: 401 }) };
  }

  return { userId: claims.sub, claims, token };
}
