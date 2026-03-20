import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const COBALT_INSTANCES = [
  "https://api.cobalt.tools",
  "https://cobalt.canine.tools",
  "https://cobalt-api.ayo.tf",
];

const TIMEOUT = 15_000;
const MIN_AUDIO_SIZE = 10_000; // 10KB — anything smaller is an error response

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
  title: string;
}

// Strategy: RapidAPI → Cobalt
// All paths download the audio server-side and store in Vercel Blob.
// Never return third-party URLs to the browser — they block datacenter IPs and browsers.
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
  const errors: string[] = [];

  // 1. RapidAPI (paid, reliable — audio only)
  if (isAudio && process.env.RAPIDAPI_KEY) {
    try {
      const result = await withTimeout(tryRapidApi(url), TIMEOUT, "RapidAPI");
      if (result) { mediaResult = result; method = "rapidapi"; }
      else { errors.push("RapidAPI: no result"); }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`RapidAPI: ${msg}`);
    }
  } else if (isAudio) {
    errors.push("RapidAPI: RAPIDAPI_KEY not set");
  }

  // 2. Cobalt (free fallback, supports mp3 + mp4)
  if (!mediaResult) {
    for (const instance of COBALT_INSTANCES) {
      try {
        const result = await withTimeout(tryCobalt(instance, url, format), TIMEOUT, instance);
        if (result) { mediaResult = result; method = `cobalt:${instance}`; break; }
        else { errors.push(`${instance}: no result`); }
      } catch (e) {
        errors.push(`${instance}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
    }
  }

  if (!mediaResult) {
    console.error("All extraction methods failed:", errors);
    return NextResponse.json(
      { error: `Could not extract media. ${errors.join(" | ")}` },
      { status: 502 }
    );
  }

  // Store in Vercel Blob — user always gets a reliable Vercel URL
  const id = crypto.randomUUID();
  const ext = format;
  const safeName = mediaResult.title.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 60);
  const filename = `${safeName}.${ext}`;

  const blob = await put(`conversions/${id}/${filename}`, Buffer.from(mediaResult.buffer), {
    access: "public",
    contentType: mediaResult.contentType,
  });

  console.log(`Converted via ${method}: ${filename} (${mediaResult.buffer.byteLength} bytes)`);
  return NextResponse.json({ downloadUrl: blob.url, filename });
}

async function tryRapidApi(url: string): Promise<MediaResult | null> {
  const videoId = extractVideoId(url);
  if (!videoId) return null;

  const apiRes = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY!,
      "X-RapidAPI-Host": "youtube-mp36.p.rapidapi.com",
    },
  });

  if (!apiRes.ok) {
    console.error("RapidAPI HTTP", apiRes.status);
    return null;
  }

  const data = await apiRes.json();
  console.log("RapidAPI response:", JSON.stringify({ status: data.status, hasLink: !!data.link, title: data.title }));

  if (data.status !== "ok" || !data.link) return null;

  // Download the audio server-side with a browser User-Agent
  const audioRes = await fetch(data.link, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  });

  if (!audioRes.ok) {
    console.error("RapidAPI download failed:", audioRes.status, audioRes.statusText);
    return null;
  }

  const buffer = await audioRes.arrayBuffer();
  console.log("RapidAPI download size:", buffer.byteLength);

  if (buffer.byteLength < MIN_AUDIO_SIZE) {
    console.error("RapidAPI download too small:", buffer.byteLength, "bytes — likely an error page");
    return null;
  }

  const title = (data.title || "youtube-audio").replace(/[^\w\s-]/g, "").trim().substring(0, 80);
  return { buffer, contentType: "audio/mpeg", title };
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

  const buffer = await mediaRes.arrayBuffer();

  if (buffer.byteLength < MIN_AUDIO_SIZE) {
    console.error(`Cobalt ${instance} download too small:`, buffer.byteLength, "bytes");
    return null;
  }

  const title = data.filename || "download";
  return { buffer, contentType: isAudio ? "audio/mpeg" : "video/mp4", title };
}
