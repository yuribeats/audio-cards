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
  const [genLog, setGenLog] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

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
    if (!track.imageUrl) return;
    setGenerating(track.id);
    setGenLog("");

    try {
      setGenStatus("LOADING AUDIO...");
      const audioRes = await fetch(track.audioUrl);
      if (!audioRes.ok) throw new Error("FAILED TO FETCH AUDIO");
      const audioBuffer = await audioRes.arrayBuffer();

      setGenStatus("LOADING IMAGE...");
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("FAILED TO LOAD IMAGE"));
        img.src = track.imageUrl!;
      });

      setGenStatus("DECODING AUDIO...");
      const audioCtx = new AudioContext();
      const decoded = await audioCtx.decodeAudioData(audioBuffer);

      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;
      const imgAspect = img.width / img.height;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (imgAspect > 1) { sw = img.height; sx = (img.width - sw) / 2; }
      else if (imgAspect < 1) { sh = img.width; sy = (img.height - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 1080, 1080);

      const canvasStream = canvas.captureStream(1);
      const dest = audioCtx.createMediaStreamDestination();
      const source = audioCtx.createBufferSource();
      source.buffer = decoded;
      source.connect(dest);
      source.connect(audioCtx.destination);

      const combined = new MediaStream([
        ...canvasStream.getTracks(),
        ...dest.stream.getTracks(),
      ]);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "video/mp4";

      const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 2_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      setGenStatus("RECORDING...");
      const trackInterval = setInterval(() => {
        const p = Math.min(Math.round((audioCtx.currentTime / decoded.duration) * 100), 100);
        setGenStatus(`RECORDING... ${p}%`);
      }, 500);

      await new Promise<void>((resolve) => {
        recorder.onstop = () => { clearInterval(trackInterval); resolve(); };
        source.onended = () => setTimeout(() => recorder.stop(), 200);
        recorder.start(1000);
        source.start();
      });

      await audioCtx.close();

      const ext = mimeType.includes("webm") ? "webm" : "mp4";
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${track.title.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setGenStatus("DONE");
      setTimeout(() => { setGenerating(null); setGenStatus(""); setGenLog(""); }, 3000);
    } catch (e) {
      console.error(e);
      setGenStatus("ERROR: " + (e instanceof Error ? e.message : "FAILED"));
      setTimeout(() => { setGenerating(null); setGenStatus(""); setGenLog(""); }, 5000);
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-4xl mb-2">AUDIO CARDS</h1>
      <p className="text-sm text-white/50 mb-10">
        UPLOAD AUDIO + COVER ART. GENERATE VIDEO. POST TO X.
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
                {track.imageUrl && (
                  <button
                    onClick={() => generateVideo(track)}
                    disabled={generating !== null}
                    className="w-full border-2 border-[#228B22] text-[#228B22] px-4 py-3 text-sm disabled:opacity-50"
                  >
                    {generating === track.id ? genStatus : "DOWNLOAD VIDEO FOR X"}
                  </button>
                )}
                {!track.imageUrl && (
                  <div className="text-xs text-white/30">ADD A COVER IMAGE TO GENERATE VIDEO</div>
                )}
                {generating === track.id && genLog && (
                  <div className="mt-2 text-xs text-white/30 break-all max-h-16 overflow-y-auto">
                    {genLog}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
