// ============================================================================
// Supabase Storage client for KB markdown blobs. Server-only — uses the
// service-role key (never exposed to browser). Mirrors the seeder's auth
// strategy from packages/db/src/seed-content.ts: sends BOTH `apikey` and
// `authorization` headers so the call works against legacy JWT keys and the
// newer sb_secret_* keys without code changes.
// ============================================================================

const KB_BUCKET = "kb";

function requireEnv(...names: string[]): string {
  for (const name of names) {
    const v = process.env[name];
    if (v) return v;
  }
  throw new Error(
    `Missing env ${names.join(" / ")} — set it in Vercel/Railway settings before saving KB content.`,
  );
}

/**
 * Supabase URL. Public anyway, so we accept either NEXT_PUBLIC_SUPABASE_URL
 * (the panel already has this for client auth) or SUPABASE_URL (server-only
 * naming convention some deployments prefer).
 */
function supabaseBaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
}

function authHeaders() {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
  };
}

/** Read a markdown blob given its `storage_path` column value. */
export async function fetchKbBlob(storagePath: string): Promise<string> {
  const url = `${supabaseBaseUrl()}/storage/v1/object/${storagePath}`;
  const res = await fetch(url, { headers: authHeaders(), cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Storage GET failed for ${storagePath} (status ${res.status}): ${body.slice(0, 200)}`,
    );
  }
  return await res.text();
}

/**
 * Upload a markdown blob. Path layout (mirrors seeder): kb/<sede>/v<n>/kb-bundle.md.
 * Returns the storage_path (without the bucket prefix) that the caller writes
 * into kb_documents.storage_path.
 */
export async function uploadKbBlob(args: {
  sedeSlug: string;
  version: number;
  content: string;
}): Promise<string> {
  const objectPath = `${KB_BUCKET}/${args.sedeSlug}/v${args.version}/kb-bundle.md`;
  const url = `${supabaseBaseUrl()}/storage/v1/object/${objectPath}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "content-type": "text/markdown; charset=utf-8",
      "x-upsert": "true",
    },
    body: args.content,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Storage upload failed for ${objectPath} (status ${res.status}): ${body.slice(0, 200)}`,
    );
  }
  return objectPath;
}

/** sluggify a sede name to a URL-safe storage segment. */
export function sedeSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
