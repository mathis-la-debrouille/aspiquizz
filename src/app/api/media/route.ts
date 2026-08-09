import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { media } from "@/server/db/schema";
import { ACCEPTED_IMAGE_MIME_TYPES, MAX_UPLOAD_BYTES, saveUpload } from "@/server/media/storage";

/**
 * Receives an already-downscaled/re-encoded image (client does the 1600px
 * resize + JPEG/WebP re-encode before upload — brief §10.1) and stores it
 * under UPLOAD_DIR, never public/. Returns the media id used everywhere
 * else (question forms, /media/[id]) — never the original filename.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (!ACCEPTED_IMAGE_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Format d'image non pris en charge." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image trop volumineuse." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { filename, sizeBytes } = await saveUpload(buffer, file.type);

  const [row] = await db
    .insert(media)
    .values({
      filename,
      originalName: file.name,
      mime: file.type,
      sizeBytes,
      uploaderId: session.user.id,
    })
    .returning({ id: media.id });

  return NextResponse.json({ id: row!.id });
}
