"use client";

import { useState, useRef, useEffect } from "react";
import { upload } from "@vercel/blob/client";

interface Track {
  id: string;
  title: string;
  filename: string;
  audioUrl: string;
  imageUrl: string | null;
  createdAt: string;
}

export default function Home() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Converter state
  const [convertUrl, setConvertUrl] = useState("");
  const [convertFormat, setConvertFormat] = useState<"mp3" | "mp4">("mp3");
  const [converting, setConverting] = useState(false);
  const [convertStatus, setConvertStatus] = useState("");

  useEffect(() => {
    fetch("/api/tracks")
      .then((r) => r.json())
      .then(setTracks)
      .catch(() => {});
  }, []);

  const doUpload = async (audioFile: File) => {
    const title = titleRef.current?.value?.trim() || audioFile.name.replace(/\.[^.]+$/, "");
    const id = crypto.randomUUID();
    setUploading(true);

    try {
      const ext = audioFile.name.split(".").pop() || "mp3";
      setProgress("UPLOADING AUDIO...");
      const audioBlob = await upload(`tracks/${id}/audio.${ext}`, audioFile, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });

      let imageUrl: string | null = null;
      const imageFile = imageRef.current?.files?.[0];
      if (imageFile) {
        setProgress("UPLOADING IMAGE...");
        const imgExt = imageFile.name.split(".").pop() || "jpg";
        const imageBlob = await upload(`tracks/${id}/cover.${imgExt}`, imageFile, {
          access: "public",
          handleUploadUrl: "/api/upload",
        });
        imageUrl = imageBlob.url;
      }

      setProgress("SAVING...");
      const res = await fetch("/api/save-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title,
          filename: audioFile.name,
          contentType: audioFile.type,
          audioUrl: audioBlob.url,
          imageUrl,
        }),
      });

      if (!res.ok) throw new Error("Failed to save track");
      const track = await res.json();
      setTracks((prev) => [track, ...prev]);
      if (titleRef.current) titleRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
      if (imageRef.current) imageRef.current.value = "";
      setImagePreview(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    }
    setUploading(false);
    setProgress("");
  };

  const handleFile = () => {
    const file = fileRef.current?.files?.[0];
    if (file) doUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) doUpload(file);
  };

  const handleImageChange = () => {
    const file = imageRef.current?.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    } else {
      setImagePreview(null);
    }
  };

  const generateVideo = async (track: Track) => {
    setGenerating(track.id);
    setGenStatus("GENERATING VIDEO...");

    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "FAILED");
      }

      const { videoUrl } = await res.json();

      setGenStatus("DOWNLOADING...");
      const videoRes = await fetch(videoUrl);
      const blob = await videoRes.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${track.title.replace(/[^a-zA-Z0-9]/g, "_")}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setGenStatus("DONE");
      setTimeout(() => { setGenerating(null); setGenStatus(""); }, 3000);
    } catch (e) {
      console.error(e);
      setGenStatus("ERROR: " + (e instanceof Error ? e.message : "FAILED"));
      setTimeout(() => { setGenerating(null); setGenStatus(""); }, 5000);
    }
  };

  const doConvert = async () => {
    if (!convertUrl.trim()) return;
    setConverting(true);
    setConvertStatus("SENDING TO COBALT...");

    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: convertUrl.trim(), format: convertFormat }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "FAILED");
      }

      setConvertStatus("DOWNLOADING...");
      const { downloadUrl, filename } = await res.json();

      const mediaRes = await fetch(downloadUrl);
      const blob = await mediaRes.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setConvertStatus("DONE");
      setTimeout(() => { setConverting(false); setConvertStatus(""); }, 3000);
    } catch (e) {
      console.error(e);
      setConvertStatus("ERROR: " + (e instanceof Error ? e.message : "FAILED"));
      setTimeout(() => { setConverting(false); setConvertStatus(""); }, 5000);
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-4xl mb-2">AUDIO CARDS</h1>
      <p className="text-sm text-white/50 mb-10">
        UPLOAD AUDIO + COVER ART. GENERATE MP4. POST TO X.
      </p>

      <div className="border-2 border-white/30 p-8 mb-10">
        <h2 className="text-lg mb-4">YOUTUBE / X URL CONVERTER</h2>
        <div className="mb-4">
          <input
            type="text"
            value={convertUrl}
            onChange={(e) => setConvertUrl(e.target.value)}
            placeholder="PASTE YOUTUBE OR X URL"
            className="w-full bg-black border border-white/30 px-3 py-2 text-white placeholder-white/20"
            disabled={converting}
          />
        </div>
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => setConvertFormat("mp3")}
            className={`border-2 px-4 py-2 text-sm ${convertFormat === "mp3" ? "border-[#228B22] text-[#228B22]" : "border-white/30 text-white/50"}`}
            disabled={converting}
          >
            MP3
          </button>
          <button
            onClick={() => setConvertFormat("mp4")}
            className={`border-2 px-4 py-2 text-sm ${convertFormat === "mp4" ? "border-[#228B22] text-[#228B22]" : "border-white/30 text-white/50"}`}
            disabled={converting}
          >
            MP4
          </button>
        </div>
        <button
          onClick={doConvert}
          disabled={converting || !convertUrl.trim()}
          className="border-2 border-white px-6 py-3 text-sm disabled:opacity-50"
        >
          {converting ? convertStatus : "CONVERT"}
        </button>
      </div>

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
        <div className="mb-4">
          <label className="text-xs text-white/50 block mb-1">COVER IMAGE</label>
          <div className="flex items-center gap-4">
            <input
              ref={imageRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
              id="image-input"
            />
            <label
              htmlFor="image-input"
              className="border border-white/30 px-4 py-2 text-xs inline-block"
            >
              {imagePreview ? "CHANGE IMAGE" : "ADD IMAGE"}
            </label>
            {imagePreview && (
              <img src={imagePreview} alt="Preview" className="w-12 h-12 object-cover" />
            )}
          </div>
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
            {uploading ? progress : "UPLOAD AUDIO"}
          </label>
          <span className="text-xs text-white/30">OR DRAG AND DROP AUDIO</span>
        </div>
      </div>

      {tracks.length > 0 && (
        <div>
          <h2 className="text-xl mb-4 border-b border-white/30 pb-2">TRACKS</h2>
          <div className="space-y-3">
            {tracks.map((track) => (
              <div key={track.id} className="border border-white/20 p-4">
                <div className="flex items-center gap-3 mb-3">
                  {track.imageUrl && (
                    <img src={track.imageUrl} alt="" className="w-12 h-12 object-cover flex-shrink-0" />
                  )}
                  <div className="text-sm">{track.title}</div>
                </div>
                {track.imageUrl ? (
                  <button
                    onClick={() => generateVideo(track)}
                    disabled={generating !== null}
                    className="w-full border-2 border-[#228B22] text-[#228B22] px-4 py-3 text-sm disabled:opacity-50"
                  >
                    {generating === track.id ? genStatus : "DOWNLOAD MP4 FOR X"}
                  </button>
                ) : (
                  <div className="text-xs text-white/30">NEEDS COVER IMAGE FOR VIDEO</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
