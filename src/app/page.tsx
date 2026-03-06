"use client";

import { useState, useRef, useEffect } from "react";

interface Track {
  id: string;
  title: string;
  filename: string;
  audioUrl: string;
  createdAt: string;
}

export default function Home() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/tracks")
      .then((r) => r.json())
      .then(setTracks)
      .catch(() => {});
  }, []);

  const upload = async (file: File) => {
    const title = titleRef.current?.value?.trim() || file.name.replace(/\.[^.]+$/, "");
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const track = await res.json();
      setTracks((prev) => [track, ...prev]);
      if (titleRef.current) titleRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    }
    setUploading(false);
  };

  const handleFile = () => {
    const file = fileRef.current?.files?.[0];
    if (file) upload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  };

  const copyLink = (id: string) => {
    const url = `${window.location.origin}/track/${id}`;
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-4xl mb-2">AUDIO CARDS</h1>
      <p className="text-sm text-white/50 mb-10">
        UPLOAD AUDIO. SHARE ON TWITTER. PLAY INLINE.
      </p>

      <div
        className={`border-2 ${dragOver ? "border-[#228B22]" : "border-white/30"} p-8 mb-10 transition-colors`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="mb-4">
          <label className="text-xs text-white/50 block mb-1">TITLE</label>
          <input
            ref={titleRef}
            type="text"
            placeholder="TRACK NAME"
            className="w-full bg-black border border-white/30 px-3 py-2 text-white placeholder-white/20"
          />
        </div>
        <div className="flex items-center gap-4">
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            onChange={handleFile}
            className="hidden"
            id="file-input"
          />
          <label
            htmlFor="file-input"
            className="border-2 border-white px-6 py-3 text-sm inline-block"
          >
            {uploading ? "UPLOADING..." : "CHOOSE FILE"}
          </label>
          <span className="text-xs text-white/30">OR DRAG AND DROP</span>
        </div>
      </div>

      {tracks.length > 0 && (
        <div>
          <h2 className="text-xl mb-4 border-b border-white/30 pb-2">TRACKS</h2>
          <div className="space-y-3">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="border border-white/20 p-4 flex items-center justify-between"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <div className="text-sm truncate">{track.title}</div>
                  <div className="text-xs text-white/30 truncate mt-1">
                    {baseUrl}/track/{track.id}
                  </div>
                </div>
                <button
                  onClick={() => copyLink(track.id)}
                  className="border border-white/30 px-4 py-2 text-xs whitespace-nowrap"
                >
                  {copied === track.id ? "COPIED" : "COPY LINK"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
