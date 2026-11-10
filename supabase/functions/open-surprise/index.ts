// Edge Function « open-surprise »
// Seul point d'entrée pour la personne qui reçoit le lien (sans compte).
// - action "preview" : indice, longueur du code et UNE photo (celle du cœur), en lien temporaire.
// - action "open"    : vérifie le code (avec la limite d'essais du SQL) puis renvoie la surprise
//                      et des liens temporaires (1 h) vers ses photos.
// La clé service_role reste ici, sur le serveur : elle n'est jamais envoyée au navigateur.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SIGNED_URL_SECONDS = 60 * 60;
const BUCKET = "photos";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function sign(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error || !data) throw new Error("signature des photos impossible");
  return data.map((d) => d.signedUrl ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ status: "error" }, 405);

  let body: { action?: unknown; slug?: unknown; code?: unknown };
  try { body = await req.json(); } catch { return reply({ status: "error" }, 400); }

  const slug = typeof body.slug === "string" ? body.slug : "";
  if (!/^[a-z0-9-]{6,64}$/.test(slug)) return reply({ status: "not_found" });

  try {
    if (body.action === "preview") {
      const { data, error } = await admin.rpc("surprise_preview", { p_slug: slug });
      if (error) throw error;
      if (data.status !== "ok") return reply(data);
      const [photo] = data.photo ? await sign([data.photo]) : [null];
      return reply({ ...data, photo });
    }

    if (body.action === "open") {
      const code = typeof body.code === "string" ? body.code : "";
      if (!/^[0-9]{4,6}$/.test(code)) return reply({ status: "wrong" });
      const { data, error } = await admin.rpc("open_surprise", { p_slug: slug, p_code: code });
      if (error) throw error;
      if (data.status !== "ok") return reply(data);
      return reply({ ...data, photos: await sign(data.photos ?? []) });
    }

    return reply({ status: "error" }, 400);
  } catch (e) {
    console.error(e);
    return reply({ status: "error" }, 500);
  }
});
