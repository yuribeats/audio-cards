import { list } from "@vercel/blob";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import TrackPlayer from "./TrackPlayer";
import VideoGenerator from "./VideoGenerator";

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

  return {
    title: track.title,
    description: " ",
    openGraph: {
      title: track.title,
      description: " ",
      type: "music.song",
      ...(track.imageUrl ? { images: [{ url: track.imageUrl, width: 1080, height: 1080 }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: track.title,
      ...(track.imageUrl ? { images: [track.imageUrl] } : {}),
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
        {track.imageUrl && (
          <VideoGenerator title={track.title} audioUrl={track.audioUrl} imageUrl={track.imageUrl} />
        )}
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
