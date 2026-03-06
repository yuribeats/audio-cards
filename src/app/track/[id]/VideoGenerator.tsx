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
  const [pct, setPct] = useState(0);

  const generate = async () => {
    setWorking(true);
    setPct(0);

    try {
      setStatus("LOADING AUDIO...");
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) throw new Error("FAILED TO FETCH AUDIO");
      const audioBuffer = await audioRes.arrayBuffer();

      setStatus("LOADING IMAGE...");
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("FAILED TO LOAD IMAGE"));
        img.src = imageUrl;
      });

      setStatus("DECODING AUDIO...");
      const audioCtx = new AudioContext();
      const decoded = await audioCtx.decodeAudioData(audioBuffer);

      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;

      const imgAspect = img.width / img.height;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (imgAspect > 1) {
        sw = img.height;
        sx = (img.width - sw) / 2;
      } else if (imgAspect < 1) {
        sh = img.width;
        sy = (img.height - sh) / 2;
      }
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
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "video/mp4";

      const recorder = new MediaRecorder(combined, {
        mimeType,
        videoBitsPerSecond: 2_000_000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      setStatus("RECORDING...");

      const trackInterval = setInterval(() => {
        if (decoded.duration > 0) {
          const elapsed = audioCtx.currentTime;
          const p = Math.min(Math.round((elapsed / decoded.duration) * 100), 100);
          setPct(p);
          setStatus(`RECORDING... ${p}%`);
        }
      }, 500);

      await new Promise<void>((resolve) => {
        recorder.onstop = () => {
          clearInterval(trackInterval);
          resolve();
        };
        source.onended = () => {
          setTimeout(() => recorder.stop(), 200);
        };
        recorder.start(1000);
        source.start();
      });

      await audioCtx.close();

      setStatus("PREPARING DOWNLOAD...");
      const ext = mimeType.includes("webm") ? "webm" : "mp4";
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setStatus("DONE");
      setPct(100);
      setTimeout(() => { setStatus(""); setWorking(false); setPct(0); }, 3000);
      return;
    } catch (e) {
      console.error(e);
      setStatus("ERROR: " + (e instanceof Error ? e.message : "FAILED"));
      setTimeout(() => { setStatus(""); setWorking(false); setPct(0); }, 5000);
      return;
    }
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
      {working && pct > 0 && (
        <div className="mt-2 h-1 bg-white/10">
          <div className="h-full bg-[#228B22] transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {working && (
        <div className="mt-2 text-xs text-white/30">
          PLAYS AUDIO WHILE RECORDING. THIS TAKES AS LONG AS THE TRACK.
        </div>
      )}
    </div>
  );
}
