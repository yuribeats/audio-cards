"use client";

import { useState } from "react";

export default function VideoGenerator({ trackId, title }: { trackId: string; title: string }) {
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  const generate = async () => {
    setWorking(true);
    setStatus("GENERATING VIDEO...");

    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "FAILED");
      }

      const { videoUrl } = await res.json();

      setStatus("DOWNLOADING...");
      const videoRes = await fetch(videoUrl);
      const blob = await videoRes.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setStatus("DONE");
      setTimeout(() => { setStatus(""); setWorking(false); }, 3000);
    } catch (e) {
      console.error(e);
      setStatus("ERROR: " + (e instanceof Error ? e.message : "FAILED"));
      setTimeout(() => { setStatus(""); setWorking(false); }, 5000);
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
    </div>
  );
}
