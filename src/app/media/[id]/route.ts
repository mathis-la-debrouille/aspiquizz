import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { media } from "@/server/db/schema";
import { readUpload } from "@/server/media/storage";

/**
 * The only way an uploaded image is ever served — authenticated, looked up
 * by opaque media id (never the original filename, which could leak the
 * answer via e.g. "chateau-de-versailles.jpg" — brief §6.3). Long cache
 * headers since a media id's content never changes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const rows = await db.select().from(media).where(eq(media.id, id)).limit(1);
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  }

  const buffer = await readUpload(row.filename);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
