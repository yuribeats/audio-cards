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
      const audioArrayBuffer = await audioRes.arrayBuffer();

      setStatus("LOADING IMAGE...");
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("FAILED TO LOAD IMAGE"));
        img.src = imageUrl;
      });

      setStatus("DECODING AUDIO...");
      const actx = new OfflineAudioContext(2, 1, 44100);
      const decoded = await actx.decodeAudioData(audioArrayBuffer);
      const duration = decoded.duration;
      const sampleRate = decoded.sampleRate;
      const numChannels = decoded.numberOfChannels;

      // Draw cover image to canvas
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;
      const imgAspect = img.width / img.height;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (imgAspect > 1) { sw = img.height; sx = (img.width - sw) / 2; }
      else if (imgAspect < 1) { sh = img.width; sy = (img.height - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 1080, 1080);

      setStatus("ENCODING...");
      const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: {
          codec: "avc",
          width: 1080,
          height: 1080,
        },
        audio: {
          codec: "aac",
          numberOfChannels: numChannels,
          sampleRate: sampleRate,
        },
        fastStart: "in-memory",
      });

      // Encode video: one keyframe per second
      const fps = 1;
      const totalFrames = Math.ceil(duration * fps);
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error("VideoEncoder error:", e),
      });

      videoEncoder.configure({
        codec: "avc1.640028",
        width: 1080,
        height: 1080,
        bitrate: 1_000_000,
        framerate: fps,
      });

      for (let i = 0; i < totalFrames; i++) {
        const frame = new VideoFrame(canvas, {
          timestamp: (i / fps) * 1_000_000,
          duration: (1 / fps) * 1_000_000,
        });
        videoEncoder.encode(frame, { keyFrame: true });
        frame.close();
        if (i % 10 === 0) {
          const p = Math.round((i / totalFrames) * 50);
          setPct(p);
          setStatus(`ENCODING VIDEO... ${p}%`);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      await videoEncoder.flush();
      videoEncoder.close();

      // Encode audio in chunks
      setStatus("ENCODING AUDIO...");
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error("AudioEncoder error:", e),
      });

      audioEncoder.configure({
        codec: "mp4a.40.2",
        numberOfChannels: numChannels,
        sampleRate: sampleRate,
        bitrate: 192_000,
      });

      const chunkSize = sampleRate; // 1 second chunks
      const totalSamples = decoded.length;

      for (let offset = 0; offset < totalSamples; offset += chunkSize) {
        const len = Math.min(chunkSize, totalSamples - offset);
        const audioData = new AudioData({
          format: "f32-planar",
          sampleRate: sampleRate,
          numberOfFrames: len,
          numberOfChannels: numChannels,
          timestamp: (offset / sampleRate) * 1_000_000,
          data: interleaveChannels(decoded, offset, len, numChannels) as unknown as BufferSource,
        });
        audioEncoder.encode(audioData);
        audioData.close();

        const p = 50 + Math.round((offset / totalSamples) * 50);
        setPct(p);
        setStatus(`ENCODING AUDIO... ${p}%`);
        await new Promise((r) => setTimeout(r, 0));
      }

      await audioEncoder.flush();
      audioEncoder.close();

      muxer.finalize();

      setStatus("DOWNLOADING...");
      const blob = new Blob([target.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setPct(100);
      setStatus("DONE");
      setTimeout(() => { setStatus(""); setWorking(false); setPct(0); }, 3000);
    } catch (e) {
      console.error(e);
      setStatus("ERROR: " + (e instanceof Error ? e.message : "FAILED"));
      setTimeout(() => { setStatus(""); setWorking(false); setPct(0); }, 5000);
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
    </div>
  );
}

function interleaveChannels(
  buffer: AudioBuffer,
  offset: number,
  length: number,
  channels: number
): Float32Array {
  const result = new Float32Array(length * channels);
  for (let ch = 0; ch < channels; ch++) {
    const channelData = buffer.getChannelData(ch);
    result.set(channelData.subarray(offset, offset + length), ch * length);
  }
  return result;
}
