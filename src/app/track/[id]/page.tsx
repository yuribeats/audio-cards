import { list } from "@vercel/blob";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import TrackPlayer from "./TrackPlayer";

interface TrackMeta {
  id: string;
  title: string;
  filename: string;
  audioUrl: string;
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const track = await getTrackMeta(id);
  if (!track) return { title: "NOT FOUND" };

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000";

  return {
    title: track.title,
    description: `Listen to ${track.title}`,
    openGraph: {
      title: track.title,
      description: `Listen to ${track.title}`,
      type: "music.song",
      audio: [
        {
          url: track.audioUrl,
        },
      ],
    },
    twitter: {
      card: "player",
      title: track.title,
      description: `Listen to ${track.title}`,
      players: [
        {
          playerUrl: `${baseUrl}/embed/${track.id}`,
          streamUrl: track.audioUrl,
          width: 480,
          height: 120,
        },
      ],
    },
    other: {
      "twitter:player": `${baseUrl}/embed/${track.id}`,
      "twitter:player:width": "480",
      "twitter:player:height": "120",
      "twitter:player:stream": track.audioUrl,
      "twitter:player:stream:content_type": "audio/mpeg",
    },
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

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000";

  const shareUrl = `${baseUrl}/track/${track.id}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg border-2 border-white p-8">
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
