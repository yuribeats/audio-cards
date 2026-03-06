import { list, put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export const maxDuration = 300;

interface TrackMeta {
  id: string;
  title: string;
  audioUrl: string;
  imageUrl: string | null;
}

async function getTrackMeta(id: string): Promise<TrackMeta | null> {
  try {
    const { blobs } = await list({ prefix: `tracks/${id}/meta.json` });
    const metaBlob = blobs.find((b) => b.pathname === `tracks/${id}/meta.json`);
    if (!metaBlob) return null;
    const res = await fetch(metaBlob.url, { cache: "no-store" });
    return res.json();
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string = require("ffmpeg-static");

function runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve({ stdout, stderr });
    });
  });
}

export async function POST(request: NextRequest) {
  const { trackId } = await request.json();
  if (!trackId) {
    return NextResponse.json({ error: "Missing trackId" }, { status: 400 });
  }

  const track = await getTrackMeta(trackId);
  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }
  if (!track.imageUrl) {
    return NextResponse.json({ error: "Track has no cover image" }, { status: 400 });
  }

  const tmp = tmpdir();
  const audioExt = track.audioUrl.split(".").pop()?.split("?")[0] || "wav";
  const imgExt = track.imageUrl.split(".").pop()?.split("?")[0] || "jpg";
  const audioPath = join(tmp, `${trackId}-audio.${audioExt}`);
  const imgPath = join(tmp, `${trackId}-cover.${imgExt}`);
  const outPath = join(tmp, `${trackId}-output.mp4`);

  try {
    // Download audio and image in parallel
    const [audioRes, imgRes] = await Promise.all([
      fetch(track.audioUrl),
      fetch(track.imageUrl),
    ]);

    if (!audioRes.ok) throw new Error("Failed to download audio");
    if (!imgRes.ok) throw new Error("Failed to download image");

    const [audioData, imgData] = await Promise.all([
      audioRes.arrayBuffer(),
      imgRes.arrayBuffer(),
    ]);

    await Promise.all([
      writeFile(audioPath, Buffer.from(audioData)),
      writeFile(imgPath, Buffer.from(imgData)),
    ]);

    // Generate video
    await runFfmpeg([
      "-y",
      "-loop", "1",
      "-i", imgPath,
      "-i", audioPath,
      "-c:v", "libx264",
      "-tune", "stillimage",
      "-c:a", "aac",
      "-b:a", "192k",
      "-pix_fmt", "yuv420p",
      "-vf", "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black",
      "-shortest",
      "-movflags", "+faststart",
      outPath,
    ]);

    // Upload to blob
    const videoData = await readFile(outPath);
    const videoBlob = await put(`tracks/${trackId}/video.mp4`, videoData, {
      access: "public",
      addRandomSuffix: false,
      contentType: "video/mp4",
    });

    // Cleanup
    await Promise.all([
      unlink(audioPath).catch(() => {}),
      unlink(imgPath).catch(() => {}),
      unlink(outPath).catch(() => {}),
    ]);

    return NextResponse.json({ videoUrl: videoBlob.url });
  } catch (e) {
    // Cleanup on error
    await Promise.all([
      unlink(audioPath).catch(() => {}),
      unlink(imgPath).catch(() => {}),
      unlink(outPath).catch(() => {}),
    ]);

    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Video generation failed" },
      { status: 500 }
    );
  }
}
