import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import ytdl from "@distube/ytdl-core";
import youtubeDl from "youtube-dl-exec";

export const maxDuration = 300;

const COBALT_INSTANCES = [
  "https://api.cobalt.tools",
  "https://cobalt.canine.tools",
  "https://cobalt-api.ayo.tf",
  "https://cookie.br0k3.me",
  "https://pizza.br0k3.me",
  "https://api.cobalt.blackcat.sweeux.org",
];

// Strategy order: yt-dlp → RapidAPI (paid) → ytdl-core → Cobalt
export async function POST(request: NextRequest) {
  const { url, format } = await request.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Missing URL" }, { status: 400 });
  }

  if (format !== "mp3" && format !== "mp4") {
    return NextResponse.json({ error: "Format must be mp3 or mp4" }, { status: 400 });
  }

  const isAudio = format === "mp3";
  let audioBuffer: ArrayBuffer | null = null;
  let contentType = isAudio ? "audio/mpeg" : "video/mp4";
  let method = "";

  // 1. yt-dlp (most maintained, free)
  if (!audioBuffer) {
    try {
      console.log("Trying yt-dlp...");
      const result = await tryYtDlp(url, isAudio);
      if (result) {
        audioBuffer = result.buffer;
        contentType = result.contentType;
        method = "yt-dlp";
        console.log("Success with yt-dlp");
      }
    } catch (e) {
      console.error("yt-dlp failed:", e);
    }
  }

  // 2. RapidAPI (paid — set RAPIDAPI_KEY env var)
  if (!audioBuffer && isAudio && process.env.RAPIDAPI_KEY) {
    try {
      console.log("Trying RapidAPI...");
      const result = await tryRapidApi(url);
      if (result) {
        audioBuffer = result.buffer;
        contentType = result.contentType;
        method = "rapidapi";
        console.log("Success with RapidAPI");
      }
    } catch (e) {
      console.error("RapidAPI failed:", e);
    }
  }

  // 3. ytdl-core (free, audio only)
  if (!audioBuffer && isAudio && ytdl.validateURL(url)) {
    try {
      console.log("Trying ytdl-core...");
      const result = await tryYtdlCore(url);
      if (result) {
        audioBuffer = result.buffer;
        contentType = result.contentType;
        method = "ytdl-core";
        console.log("Success with ytdl-core");
      }
    } catch (e) {
      console.error("ytdl-core failed:", e);
    }
  }

  // 4. Cobalt instances (free fallback, supports mp3 + mp4)
  if (!audioBuffer) {
    for (const instance of COBALT_INSTANCES) {
      try {
        console.log(`Trying cobalt: ${instance}`);
        const result = await tryCobalt(instance, url, format);
        if (result) {
          audioBuffer = result.buffer;
          contentType = result.contentType;
          method = `cobalt:${instance}`;
          console.log(`Success with ${instance}`);
          break;
        }
      } catch (e) {
        console.error(`${instance} failed:`, e);
        continue;
      }
    }
  }

  if (!audioBuffer) {
    return NextResponse.json(
      { error: "Could not extract media. All methods failed." },
      { status: 502 }
    );
  }

  // Store in Vercel Blob
  const id = crypto.randomUUID();
  const filename = `conversion-${id}.${format}`;

  const blob = await put(`conversions/${filename}`, Buffer.from(audioBuffer), {
    access: "public",
    contentType,
  });

  console.log(`Stored via ${method}: ${blob.url}`);

  return NextResponse.json({
    downloadUrl: blob.url,
    filename,
  });
}

// --- Helpers ---

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

interface MediaResult {
  buffer: ArrayBuffer;
  contentType: string;
}

// --- yt-dlp ---
async function tryYtDlp(url: string, audioOnly: boolean): Promise<MediaResult | null> {
  const fmt = audioOnly
    ? "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio"
    : "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";

  const info = await youtubeDl(url, {
    dumpSingleJson: true,
    format: fmt,
    noCheckCertificates: true,
    noWarnings: true,
    addHeader: [
      "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    ],
  }) as Record<string, unknown>;

  const mediaUrl = (info.url as string) || null;
  if (!mediaUrl) return null;

  const ext = (info.ext as string) || (audioOnly ? "webm" : "mp4");
  const ct = audioOnly
    ? (ext === "m4a" ? "audio/mp4" : ext === "webm" ? "audio/webm" : "audio/mpeg")
    : "video/mp4";

  const response = await fetch(mediaUrl);
  if (!response.ok) return null;

  return { buffer: await response.arrayBuffer(), contentType: ct };
}

// --- RapidAPI (audio only) ---
async function tryRapidApi(url: string): Promise<MediaResult | null> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return null;

  const videoId = extractVideoId(url);
  if (!videoId) return null;

  const host = process.env.RAPIDAPI_HOST || "youtube-mp36.p.rapidapi.com";
  const endpoint = process.env.RAPIDAPI_ENDPOINT || `https://${host}/dl?id=${videoId}`;

  const response = await fetch(endpoint, {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": host,
    },
  });

  if (!response.ok) return null;
  const data = await response.json();
  if (data.status !== "ok" || !data.link) return null;

  const audioResponse = await fetch(data.link);
  if (!audioResponse.ok) return null;

  return { buffer: await audioResponse.arrayBuffer(), contentType: "audio/mpeg" };
}

// --- ytdl-core (audio only) ---
async function tryYtdlCore(url: string): Promise<MediaResult | null> {
  const info = await ytdl.getInfo(url, {
    requestOptions: {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    },
  });

  const fmt = ytdl.chooseFormat(info.formats, {
    quality: "highestaudio",
    filter: "audioonly",
  });

  const response = await fetch(fmt.url);
  if (!response.ok) return null;

  return {
    buffer: await response.arrayBuffer(),
    contentType: fmt.mimeType?.split(";")[0] ?? "audio/webm",
  };
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
