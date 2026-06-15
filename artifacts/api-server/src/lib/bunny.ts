const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE ?? "combozap";
const BUNNY_STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME ?? "storage.bunnycdn.com";
const BUNNY_CDN_URL = process.env.BUNNY_CDN_URL ?? "https://combozap.b-cdn.net";
const BUNNY_STORAGE_PASSWORD = process.env.BUNNY_STORAGE_PASSWORD ?? "";

function sanitizeEmail(email: string): string {
  return email.toLowerCase().replace(/@/g, "-at-").replace(/\./g, "-").replace(/[^a-z0-9-]/g, "_");
}

function mimeToExt(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return map[base] ?? "bin";
}

export function buildMediaPath(
  userEmail: string,
  slotNumber: number,
  messageId: string,
  mime: string,
): string {
  const safeEmail = sanitizeEmail(userEmail);
  const safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const ext = mimeToExt(mime);
  return `${safeEmail}/slot-${slotNumber}/media/${safeId}.${ext}`;
}

export async function uploadMediaToBunny(
  storagePath: string,
  base64Data: string,
  contentType: string,
): Promise<string | null> {
  if (!BUNNY_STORAGE_PASSWORD) {
    console.warn("[bunny] BUNNY_STORAGE_PASSWORD not set — skipping upload");
    return null;
  }
  try {
    const buffer = Buffer.from(base64Data, "base64");
    const url = `https://${BUNNY_STORAGE_HOSTNAME}/${BUNNY_STORAGE_ZONE}/${storagePath}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "AccessKey": BUNNY_STORAGE_PASSWORD,
        "Content-Type": contentType.split(";")[0].trim(),
      },
      body: buffer,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[bunny] upload failed ${res.status}: ${txt.slice(0, 200)}`);
      return null;
    }
    // Return the storage path — the API proxy serves it to authenticated clients
    return storagePath;
  } catch (err) {
    console.error("[bunny] upload error:", String(err));
    return null;
  }
}

/**
 * Downloads a WhatsApp profile picture URL and uploads it to Bunny CDN.
 * Returns the public CDN URL or null on failure.
 */
export async function uploadAvatarToBunny(
  jid: string,
  sourceUrl: string,
): Promise<string | null> {
  if (!BUNNY_STORAGE_PASSWORD) return null;
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const safeJid = jid.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 60);
    const storagePath = `avatars/${safeJid}.${ext}`;
    const buffer = Buffer.from(await res.arrayBuffer());
    const uploadUrl = `https://${BUNNY_STORAGE_HOSTNAME}/${BUNNY_STORAGE_ZONE}/${storagePath}`;
    const up = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "AccessKey": BUNNY_STORAGE_PASSWORD, "Content-Type": contentType.split(";")[0].trim() },
      body: buffer,
      signal: AbortSignal.timeout(15_000),
    });
    if (!up.ok) return null;
    return `${BUNNY_CDN_URL}/${storagePath}`;
  } catch {
    return null;
  }
}

/** Called on user registration — creates the user's root folder in Bunny */
export async function initUserFolderBunny(userEmail: string): Promise<void> {
  if (!BUNNY_STORAGE_PASSWORD) return;
  try {
    const safeEmail = sanitizeEmail(userEmail);
    const url = `https://${BUNNY_STORAGE_HOSTNAME}/${BUNNY_STORAGE_ZONE}/${safeEmail}/.init`;
    await fetch(url, {
      method: "PUT",
      headers: {
        "AccessKey": BUNNY_STORAGE_PASSWORD,
        "Content-Type": "text/plain",
      },
      body: Buffer.from(userEmail),
      signal: AbortSignal.timeout(10_000),
    });
    console.log(`[bunny] folder created for ${userEmail}`);
  } catch (err) {
    console.error("[bunny] initUserFolder error:", String(err));
  }
}
