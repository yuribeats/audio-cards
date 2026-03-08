import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const COBALT_API = "https://api.cobalt.tools";

export async function POST(request: NextRequest) {
  const { url, format } = await request.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Missing URL" }, { status: 400 });
  }

  if (format !== "mp3" && format !== "mp4") {
    return NextResponse.json({ error: "Format must be mp3 or mp4" }, { status: 400 });
  }

  try {
    // Call cobalt API
    const cobaltBody: Record<string, string | boolean> = {
      url,
      filenameStyle: "basic",
    };

    if (format === "mp3") {
      cobaltBody.downloadMode = "audio";
      cobaltBody.audioFormat = "mp3";
      cobaltBody.audioBitrate = "320";
    } else {
      cobaltBody.downloadMode = "auto";
      cobaltBody.videoQuality = "1080";
      cobaltBody.youtubeVideoCodec = "h264";
    }

    const cobaltRes = await fetch(COBALT_API, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cobaltBody),
    });

    if (!cobaltRes.ok) {
      const text = await cobaltRes.text();
      console.error("Cobalt API error:", cobaltRes.status, text);
      return NextResponse.json(
        { error: `Cobalt API returned ${cobaltRes.status}` },
        { status: 502 }
      );
    }

    const cobaltData = await cobaltRes.json();

    if (cobaltData.status === "error") {
      const code = cobaltData.error?.code || "unknown";
      return NextResponse.json({ error: `Cobalt error: ${code}` }, { status: 502 });
    }

    // Get the download URL from cobalt response
    const downloadUrl = cobaltData.url;
    if (!downloadUrl) {
      // Picker response (multiple items) - take first video/audio
      if (cobaltData.picker && cobaltData.picker.length > 0) {
        const item = cobaltData.picker[0];
        return await downloadAndStore(item.url, format);
      }
      // Audio URL from picker response
      if (cobaltData.audio) {
        return await downloadAndStore(cobaltData.audio, format);
      }
      return NextResponse.json({ error: "No download URL returned" }, { status: 502 });
    }

    return await downloadAndStore(downloadUrl, format);
  } catch (e) {
    console.error("Convert error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Conversion failed" },
      { status: 500 }
    );
  }
}

async function downloadAndStore(mediaUrl: string, format: string) {
  // Download the media file
  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok) {
    return NextResponse.json(
      { error: `Failed to download media: ${mediaRes.status}` },
      { status: 502 }
    );
  }

  const contentType = format === "mp3" ? "audio/mpeg" : "video/mp4";
  const ext = format;
  const id = crypto.randomUUID();
  const filename = `conversion-${id}.${ext}`;

  // Stream to Vercel Blob
  const data = await mediaRes.arrayBuffer();
  const blob = await put(`conversions/${filename}`, Buffer.from(data), {
    access: "public",
    contentType,
  });

  return NextResponse.json({
    downloadUrl: blob.url,
    filename,
  });
}
