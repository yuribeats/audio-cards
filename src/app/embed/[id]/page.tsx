import { list } from "@vercel/blob";
import { notFound } from "next/navigation";
import EmbedPlayer from "./EmbedPlayer";

interface TrackMeta {
  id: string;
  title: string;
  audioUrl: string;
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

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const track = await getTrackMeta(id);
  if (!track) notFound();

  return (
    <html lang="en">
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
            * { margin: 0; padding: 0; box-sizing: border-box; border-radius: 0 !important; cursor: default !important; }
            body { background: #000; color: #fff; font-family: Arial, Helvetica, sans-serif; font-weight: 700; text-transform: uppercase; }
          `,
          }}
        />
      </head>
      <body>
        <EmbedPlayer title={track.title} audioUrl={track.audioUrl} />
      </body>
    </html>
  );
}
