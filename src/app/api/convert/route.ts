import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const COBALT_INSTANCES = [
  "https://api.cobalt.tools",
  "https://cobalt.canine.tools",
  "https://cobalt-api.ayo.tf",
];

const TIMEOUT = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

interface MediaResult {
  buffer: ArrayBuffer;
  contentType: string;
}

// Strategy: RapidAPI → Cobalt
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

  // 1. RapidAPI (paid, reliable — audio only)
  if (isAudio && process.env.RAPIDAPI_KEY) {
    try {
      const result = await withTimeout(tryRapidApi(url), TIMEOUT, "RapidAPI");
      if (result) { mediaResult = result; method = "rapidapi"; }
    } catch (e) {
      console.error("RapidAPI failed:", e instanceof Error ? e.message : e);
    }
  }

  // 2. Cobalt (free fallback, supports mp3 + mp4)
  if (!mediaResult) {
    for (const instance of COBALT_INSTANCES) {
      try {
        const result = await withTimeout(tryCobalt(instance, url, format), TIMEOUT, instance);
        if (result) { mediaResult = result; method = `cobalt:${instance}`; break; }
      } catch { continue; }
    }
  }

  if (!mediaResult) {
    return NextResponse.json(
      { error: "Could not extract media. All methods failed." },
      { status: 502 }
    );
  }

  const id = crypto.randomUUID();
  const filename = `conversion-${id}.${format}`;

  const blob = await put(`conversions/${filename}`, Buffer.from(mediaResult.buffer), {
    access: "public",
    contentType: mediaResult.contentType,
  });

  console.log(`Stored via ${method}: ${blob.url}`);

  return NextResponse.json({ downloadUrl: blob.url, filename });
}

async function tryRapidApi(url: string): Promise<MediaResult | null> {
  const videoId = extractVideoId(url);
  if (!videoId) return null;

  const res = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY!,
      "X-RapidAPI-Host": "youtube-mp36.p.rapidapi.com",
    },
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== "ok" || !data.link) return null;

  const audioRes = await fetch(data.link);
  if (!audioRes.ok) return null;

  return { buffer: await audioRes.arrayBuffer(), contentType: "audio/mpeg" };
}

async function tryCobalt(instance: string, url: string, format: string): Promise<MediaResult | null> {
  const isAudio = format === "mp3";

  const body: Record<string, string | boolean> = { url, filenameStyle: "basic" };
  if (isAudio) {
    body.downloadMode = "audio";
    body.audioFormat = "mp3";
    body.audioBitrate = "320";
  } else {
    body.downloadMode = "auto";
    body.videoQuality = "1080";
    body.youtubeVideoCodec = "h264";
  }

  const response = await fetch(instance, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

  return { buffer: await mediaRes.arrayBuffer(), contentType: isAudio ? "audio/mpeg" : "video/mp4" };
}
