import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const COBALT_INSTANCES = [
  "https://cookie.br0k3.me",
  "https://pizza.br0k3.me",
  "https://api.cobalt.blackcat.sweeux.org",
];

export async function POST(request: NextRequest) {
  const { url, format } = await request.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Missing URL" }, { status: 400 });
  }

  if (format !== "mp3" && format !== "mp4") {
    return NextResponse.json({ error: "Format must be mp3 or mp4" }, { status: 400 });
  }

  try {
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

    const body = JSON.stringify(cobaltBody);
    let cobaltData = null;
    let lastError = "";

    for (const instance of COBALT_INSTANCES) {
      try {
        console.log(`Trying cobalt instance: ${instance}`);
        const cobaltRes = await fetch(instance, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body,
        });

        if (!cobaltRes.ok) {
          const text = await cobaltRes.text();
          console.error(`${instance} returned ${cobaltRes.status}: ${text}`);
          lastError = `${instance} returned ${cobaltRes.status}`;
          continue;
        }

        cobaltData = await cobaltRes.json();

        if (cobaltData.status === "error") {
          const code = cobaltData.error?.code || "unknown";
          console.error(`${instance} error: ${code}`);
          lastError = `Cobalt error: ${code}`;
          cobaltData = null;
          continue;
        }

        console.log(`Success with ${instance}`);
        break;
      } catch (e) {
        console.error(`${instance} failed:`, e);
        lastError = e instanceof Error ? e.message : "Request failed";
        continue;
      }
    }

    if (!cobaltData) {
      return NextResponse.json(
        { error: lastError || "All cobalt instances failed" },
        { status: 502 }
      );
    }

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
