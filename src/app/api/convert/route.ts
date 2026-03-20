import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
const MIN_AUDIO_SIZE = 10_000;

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export async function POST(request: NextRequest) {
  const { url, format } = await request.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Missing URL" }, { status: 400 });
  }

  if (format !== "mp3") {
    return NextResponse.json({ error: "Only MP3 supported" }, { status: 400 });
  }

  if (!process.env.RAPIDAPI_KEY) {
    return NextResponse.json({ error: "RAPIDAPI_KEY not configured" }, { status: 500 });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json({ error: "Could not extract YouTube video ID from URL" }, { status: 400 });
  }

  // Call RapidAPI
  const apiRes = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": "youtube-mp36.p.rapidapi.com",
    },
  });

  if (!apiRes.ok) {
    const text = await apiRes.text();
    console.error("RapidAPI HTTP", apiRes.status, text);
    return NextResponse.json({ error: `RapidAPI error: HTTP ${apiRes.status}` }, { status: 502 });
  }

  const data = await apiRes.json();
  console.log("RapidAPI response:", JSON.stringify(data));

  if (data.status !== "ok" || !data.link) {
    return NextResponse.json(
      { error: `RapidAPI: ${data.msg || data.status || "no download link returned"}` },
      { status: 502 }
    );
  }

  // Download the audio server-side
  const audioRes = await fetch(data.link, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  });

  if (!audioRes.ok) {
    console.error("Audio download failed:", audioRes.status, audioRes.statusText);
    return NextResponse.json(
      { error: `Audio download failed: HTTP ${audioRes.status}` },
      { status: 502 }
    );
  }

  const buffer = await audioRes.arrayBuffer();
  console.log("Audio download size:", buffer.byteLength, "bytes");

  if (buffer.byteLength < MIN_AUDIO_SIZE) {
    console.error("Audio too small:", buffer.byteLength, "bytes");
    return NextResponse.json(
      { error: `Download failed — got ${buffer.byteLength} bytes instead of audio` },
      { status: 502 }
    );
  }

  // Store in Vercel Blob
  const title = (data.title || "youtube-audio").replace(/[^\w\s-]/g, "").trim().substring(0, 60);
  const filename = `${title}.mp3`;
  const id = crypto.randomUUID();

  const blob = await put(`conversions/${id}/${filename}`, Buffer.from(buffer), {
    access: "public",
    contentType: "audio/mpeg",
  });

  console.log(`Done: ${filename} (${buffer.byteLength} bytes) → ${blob.url}`);
  return NextResponse.json({ downloadUrl: blob.url, filename });
}
