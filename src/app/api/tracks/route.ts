import { list } from "@vercel/blob";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const { blobs } = await list({ prefix: "tracks/", mode: "folded" });

  const metaBlobs = [];
  for (const blob of blobs) {
    if (blob.pathname.endsWith("/meta.json")) {
      metaBlobs.push(blob);
    }
  }

  if (metaBlobs.length === 0) {
    const allBlobs = await list({ prefix: "tracks/" });
    for (const blob of allBlobs.blobs) {
      if (blob.pathname.endsWith("/meta.json")) {
        metaBlobs.push(blob);
      }
    }
  }

  const tracks = [];
  for (const blob of metaBlobs) {
    try {
      const res = await fetch(blob.url);
      const meta = await res.json();
      tracks.push(meta);
    } catch {
      continue;
    }
  }

  tracks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(tracks);
}
