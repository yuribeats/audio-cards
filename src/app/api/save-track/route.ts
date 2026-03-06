import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { id, title, filename, contentType, audioUrl, imageUrl } = await request.json();

  if (!id || !audioUrl) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const meta = {
    id,
    title: title || "Untitled",
    filename: filename || "audio",
    contentType: contentType || "audio/mpeg",
    audioUrl,
    imageUrl: imageUrl || null,
    createdAt: new Date().toISOString(),
  };

  await put(`tracks/${id}/meta.json`, JSON.stringify(meta), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });

  return NextResponse.json(meta);
}
