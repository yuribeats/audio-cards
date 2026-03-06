import { list } from "@vercel/blob";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import TrackPlayer from "./TrackPlayer";

interface TrackMeta {
  id: string;
  title: string;
  filename: string;
  audioUrl: string;
  imageUrl: string | null;
  createdAt: string;
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

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    const val = process.env.NEXT_PUBLIC_BASE_URL;
    return val.startsWith("http") ? val : `https://${val}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const track = await getTrackMeta(id);
  if (!track) return { title: "NOT FOUND" };

  const baseUrl = getBaseUrl();

  const other: Record<string, string> = {
    "twitter:player": `${baseUrl}/embed/${track.id}`,
    "twitter:player:width": "480",
    "twitter:player:height": "480",
    "twitter:player:stream": track.audioUrl,
    "twitter:player:stream:content_type": "audio/mpeg",
  };

  if (track.imageUrl) {
    other["twitter:image"] = track.imageUrl;
  }

  return {
    title: track.title,
    description: " ",
    openGraph: {
      title: " ",
      description: " ",
      type: "music.song",
      ...(track.imageUrl ? { images: [{ url: track.imageUrl, width: 480, height: 480 }] } : {}),
      audio: [{ url: track.audioUrl }],
    },
    twitter: {
      card: "player",
      title: " ",
      description: " ",
      ...(track.imageUrl ? { images: [track.imageUrl] } : {}),
      players: [
        {
          playerUrl: `${baseUrl}/embed/${track.id}`,
          streamUrl: track.audioUrl,
          width: 480,
          height: 480,
        },
      ],
    },
    other,
  };
}

export default async function TrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const track = await getTrackMeta(id);
  if (!track) notFound();

  const baseUrl = getBaseUrl();
  const shareUrl = `${baseUrl}/track/${track.id}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg border-2 border-white p-8">
        {track.imageUrl && (
          <div className="mb-6">
            <img
              src={track.imageUrl}
              alt={track.title}
              className="w-full aspect-square object-cover"
            />
          </div>
        )}
        <h1 className="text-3xl mb-6">{track.title}</h1>
        <TrackPlayer audioUrl={track.audioUrl} />
        <div className="mt-8 border-t border-white/30 pt-6">
          <p className="text-xs text-white/50 mb-2">SHARE LINK</p>
          <div className="flex">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 bg-black border border-white/30 px-3 py-2 text-sm text-white/70"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
