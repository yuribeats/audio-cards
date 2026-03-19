import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const COBALT_INSTANCES = [
  "https://api.cobalt.tools",
  "https://cobalt.canine.tools",
  "https://cobalt-api.ayo.tf",
  "https://cookie.br0k3.me",
  "https://pizza.br0k3.me",
  "https://api.cobalt.blackcat.sweeux.org",
];

const STRATEGY_TIMEOUT = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

interface MediaResult {
  buffer: ArrayBuffer;
  contentType: string;
  title?: string;
}

// Strategy order: yt-proxy (Railway) → Cobalt
export async function POST(request: NextRequest) {
  const { url, format } = await request.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Missing URL" }, { status: 400 });
  }

  if (format !== "mp3" && format !== "mp4") {
    return NextResponse.json({ error: "Format must be mp3 or mp4" }, { status: 400 });
  }

  const isAudio = format === "mp3";
  let mediaResult: MediaResult | null = null;
  let method = "";

  // 1. Self-hosted yt-dlp proxy (Railway)
  if (process.env.YT_PROXY_URL) {
    try {
      console.log("Trying yt-proxy...");
      const result = await withTimeout(tryYtProxy(url, isAudio), STRATEGY_TIMEOUT, "yt-proxy");
      if (result) {
        mediaResult = result;
        method = "yt-proxy";
        console.log("Success with yt-proxy");
      }
    } catch (e) {
      console.error("yt-proxy failed:", e instanceof Error ? e.message : e);
    }
  }

  // 2. Cobalt instances (free fallback, supports mp3 + mp4)
  if (!mediaResult) {
    for (const instance of COBALT_INSTANCES) {
      try {
        console.log(`Trying cobalt: ${instance}`);
        const result = await withTimeout(tryCobalt(instance, url, format), STRATEGY_TIMEOUT, instance);
        if (result) {
          mediaResult = result;
          method = `cobalt:${instance}`;
          console.log(`Success with ${instance}`);
          break;
        }
      } catch (e) {
        console.error(`${instance} failed:`, e instanceof Error ? e.message : e);
        continue;
      }
    }
  }

  if (!mediaResult) {
    return NextResponse.json(
      { error: "Could not extract media. All methods failed." },
      { status: 502 }
    );
  }

  // Store in Vercel Blob
  const id = crypto.randomUUID();
  const filename = `conversion-${id}.${format}`;

  const blob = await put(`conversions/${filename}`, Buffer.from(mediaResult.buffer), {
    access: "public",
    contentType: mediaResult.contentType,
  });

  console.log(`Stored via ${method}: ${blob.url}`);

  return NextResponse.json({
    downloadUrl: blob.url,
    filename,
  });
}

// --- Self-hosted yt-dlp proxy (Railway) ---
async function tryYtProxy(url: string, audioOnly: boolean): Promise<MediaResult | null> {
  const proxyUrl = process.env.YT_PROXY_URL;
  if (!proxyUrl) return null;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.YT_PROXY_SECRET) {
    headers["x-api-secret"] = process.env.YT_PROXY_SECRET;
  }

  const res = await fetch(`${proxyUrl}/api/extract`, {
    method: "POST",
    headers,
    body: JSON.stringify({ url, audioOnly }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data.audioUrl) return null;

  const audioRes = await fetch(`${proxyUrl}/api/download?url=${encodeURIComponent(data.audioUrl)}`, {
    headers: process.env.YT_PROXY_SECRET ? { "x-api-secret": process.env.YT_PROXY_SECRET } : {},
  });
  if (!audioRes.ok) return null;

  const ct = audioOnly
    ? (data.contentType || "audio/webm")
    : "video/mp4";

  return { buffer: await audioRes.arrayBuffer(), contentType: ct };
}

// --- Cobalt (mp3 + mp4) ---
async function tryCobalt(instance: string, url: string, format: string): Promise<MediaResult | null> {
  const isAudio = format === "mp3";

  const cobaltBody: Record<string, string | boolean> = {
    url,
    filenameStyle: "basic",
  };

  if (isAudio) {
    cobaltBody.downloadMode = "audio";
    cobaltBody.audioFormat = "mp3";
    cobaltBody.audioBitrate = "320";
  } else {
    cobaltBody.downloadMode = "auto";
    cobaltBody.videoQuality = "1080";
    cobaltBody.youtubeVideoCodec = "h264";
  }

  const response = await fetch(instance, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cobaltBody),
  });

  if (!response.ok) return null;
  const data = await response.json();
  if (data.status === "error") return null;

  let downloadUrl = data.url;
  if (!downloadUrl) {
    if (data.picker?.length > 0) downloadUrl = data.picker[0].url;
    else if (data.audio) downloadUrl = data.audio;
    else return null;
  }

  const mediaRes = await fetch(downloadUrl);
  if (!mediaRes.ok) return null;

  const ct = isAudio ? "audio/mpeg" : "video/mp4";
  return { buffer: await mediaRes.arrayBuffer(), contentType: ct };
}
