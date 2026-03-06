"use client";

import { useState } from "react";

export default function VideoGenerator({
  title,
  audioUrl,
  imageUrl,
}: {
  title: string;
  audioUrl: string;
  imageUrl: string;
}) {
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [log, setLog] = useState("");

  const generate = async () => {
    setWorking(true);
    setLog("");

    try {
      setStatus("LOADING FFMPEG...");
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");

      const ffmpeg = new FFmpeg();

      ffmpeg.on("log", ({ message }) => {
        setLog(message);
      });

      ffmpeg.on("progress", ({ progress }) => {
        setStatus(`ENCODING... ${Math.round(progress * 100)}%`);
      });

      await ffmpeg.load({
        coreURL: "/ffmpeg/ffmpeg-core.js",
        wasmURL: "/ffmpeg/ffmpeg-core.wasm",
      });

      setStatus("DOWNLOADING AUDIO...");
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) throw new Error("Failed to fetch audio");
      const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
      const audioExt = audioUrl.split(".").pop()?.split("?")[0] || "wav";
      await ffmpeg.writeFile(`input.${audioExt}`, audioBytes);

      setStatus("DOWNLOADING IMAGE...");
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) throw new Error("Failed to fetch image");
      const imageBytes = new Uint8Array(await imageRes.arrayBuffer());
      const imgExt = imageUrl.split(".").pop()?.split("?")[0] || "jpg";
      await ffmpeg.writeFile(`cover.${imgExt}`, imageBytes);

      setStatus("GENERATING VIDEO...");
      const exitCode = await ffmpeg.exec([
        "-loop", "1",
        "-i", `cover.${imgExt}`,
        "-i", `input.${audioExt}`,
        "-c:v", "libx264",
        "-tune", "stillimage",
        "-c:a", "aac",
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-vf", "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black",
        "-shortest",
        "-movflags", "+faststart",
        "output.mp4",
      ]);

      if (exitCode !== 0) throw new Error(`FFMPEG exited with code ${exitCode}`);

      setStatus("PREPARING DOWNLOAD...");
      const data = await ffmpeg.readFile("output.mp4");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = new Blob([(data as any).buffer || data], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setStatus("DONE");
      setTimeout(() => { setStatus(""); setLog(""); }, 3000);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "FAILED";
      setStatus("ERROR: " + msg);
      setLog(msg);
    }

    setWorking(false);
  };

  return (
    <div className="mt-6">
      <button
        onClick={generate}
        disabled={working}
        className="w-full border-2 border-[#228B22] text-[#228B22] px-6 py-3 text-sm disabled:opacity-50"
      >
        {working ? status : "DOWNLOAD VIDEO FOR X"}
      </button>
      {log && (
        <div className="mt-2 text-xs text-white/30 break-all max-h-20 overflow-y-auto">
          {log}
        </div>
      )}
    </div>
  );
}
