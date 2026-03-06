"use client";

import { useState, useRef } from "react";

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
  const ffmpegRef = useRef<any>(null);

  const generate = async () => {
    setWorking(true);

    try {
      setStatus("LOADING FFMPEG...");
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL, fetchFile } = await import("@ffmpeg/util");

      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      setStatus("DOWNLOADING AUDIO...");
      const audioData = await fetchFile(audioUrl);
      const audioExt = audioUrl.split(".").pop()?.split("?")[0] || "wav";
      await ffmpeg.writeFile(`input.${audioExt}`, audioData);

      setStatus("DOWNLOADING IMAGE...");
      const imageData = await fetchFile(imageUrl);
      const imgExt = imageUrl.split(".").pop()?.split("?")[0] || "jpg";
      await ffmpeg.writeFile(`cover.${imgExt}`, imageData);

      setStatus("GENERATING VIDEO...");
      await ffmpeg.exec([
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
      URL.revokeObjectURL(url);

      setStatus("DONE");
      setTimeout(() => setStatus(""), 3000);
    } catch (e) {
      console.error(e);
      setStatus("ERROR: " + (e instanceof Error ? e.message : "FAILED"));
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
    </div>
  );
}
