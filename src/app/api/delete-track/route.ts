import { list, del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { trackId } = await request.json();
  if (!trackId) {
    return NextResponse.json({ error: "Missing trackId" }, { status: 400 });
  }

  const { blobs } = await list({ prefix: `tracks/${trackId}/` });
  if (blobs.length === 0) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  await del(blobs.map((b) => b.url));
  return NextResponse.json({ deleted: trackId });
}
