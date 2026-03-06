import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const image = formData.get("image") as File | null;
  const title = (formData.get("title") as string) || "Untitled";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const allowedTypes = [
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/ogg",
    "audio/aac",
    "audio/mp4",
    "audio/x-m4a",
    "audio/flac",
  ];

  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|aac|m4a|flac)$/i)) {
    return NextResponse.json({ error: "Invalid audio file type" }, { status: 400 });
  }

  const id = randomUUID();
  const ext = file.name.split(".").pop() || "mp3";

  const audioBlob = await put(`tracks/${id}/audio.${ext}`, file, {
    access: "public",
    addRandomSuffix: false,
  });

  let imageUrl: string | null = null;
  if (image && image.size > 0) {
    const imgExt = image.name.split(".").pop() || "jpg";
    const imageBlob = await put(`tracks/${id}/cover.${imgExt}`, image, {
      access: "public",
      addRandomSuffix: false,
    });
    imageUrl = imageBlob.url;
  }

  const meta = {
    id,
    title,
    filename: file.name,
    contentType: file.type,
    audioUrl: audioBlob.url,
    imageUrl,
    createdAt: new Date().toISOString(),
  };

  await put(`tracks/${id}/meta.json`, JSON.stringify(meta), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });

  return NextResponse.json(meta);
}
