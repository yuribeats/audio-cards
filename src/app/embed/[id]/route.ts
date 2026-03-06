import { list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

interface TrackMeta {
  id: string;
  title: string;
  audioUrl: string;
  imageUrl: string | null;
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

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const track = await getTrackMeta(id);

  if (!track) {
    return new NextResponse("Not found", { status: 404 });
  }

  const title = escapeHtml(track.title);
  const audioUrl = escapeHtml(track.audioUrl);
  const imageUrl = track.imageUrl ? escapeHtml(track.imageUrl) : null;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #000; color: #fff; font-family: Arial, Helvetica, sans-serif; font-weight: 700; text-transform: uppercase; overflow: hidden; width: 480px; height: 480px; }
.wrap { width: 480px; height: 480px; display: flex; flex-direction: column; }
.cover { flex: 1; overflow: hidden; position: relative; }
.cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.play-btn { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80px; height: 80px; border: 3px solid #fff; background: rgba(0,0,0,0.6); color: #fff; font-size: 28px; display: flex; align-items: center; justify-content: center; font-weight: 700; cursor: pointer; }
.controls { padding: 12px 16px; background: #000; }
.title-row { font-size: 13px; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-wrap { height: 6px; background: rgba(255,255,255,0.2); position: relative; cursor: pointer; }
.bar-fill { position: absolute; top: 0; left: 0; bottom: 0; background: #228B22; width: 0%; }
.times { display: flex; justify-content: space-between; font-size: 10px; margin-top: 3px; opacity: 0.5; }
.no-img { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.no-img .play-btn { position: static; transform: none; width: 44px; height: 44px; font-size: 16px; flex-shrink: 0; }
</style>
</head>
<body>
<div class="wrap">
<audio id="audio" src="${audioUrl}" preload="metadata"></audio>
${imageUrl ? `
<div class="cover">
<img src="${imageUrl}" alt="${title}">
<button class="play-btn" id="playbtn">&#9654;</button>
</div>
<div class="controls">
<div class="title-row">${title}</div>
` : `
<div class="controls" style="flex:1;display:flex;flex-direction:column;justify-content:center;">
<div class="no-img">
<button class="play-btn" id="playbtn">&#9654;</button>
<div class="title-row">${title}</div>
</div>
`}
<div>
<div class="bar-wrap" id="bar">
<div class="bar-fill" id="fill"></div>
</div>
<div class="times">
<span id="cur">0:00</span>
<span id="dur">0:00</span>
</div>
</div>
</div>
</div>
<script>
var a = document.getElementById('audio');
var btn = document.getElementById('playbtn');
var bar = document.getElementById('bar');
var fill = document.getElementById('fill');
var cur = document.getElementById('cur');
var dur = document.getElementById('dur');
var playing = false;
function fmt(s) { var m = Math.floor(s/60); var sec = Math.floor(s%60); return m + ':' + (sec < 10 ? '0' : '') + sec; }
btn.onclick = function() {
  if (playing) { a.pause(); btn.innerHTML = '&#9654;'; }
  else { a.play(); btn.innerHTML = 'II'; }
  playing = !playing;
};
a.onended = function() { playing = false; btn.innerHTML = '&#9654;'; };
a.ontimeupdate = function() {
  if (a.duration) { fill.style.width = (a.currentTime / a.duration * 100) + '%'; }
  cur.textContent = fmt(a.currentTime);
};
a.onloadedmetadata = function() { dur.textContent = fmt(a.duration); };
bar.onclick = function(e) {
  if (!a.duration) return;
  var rect = bar.getBoundingClientRect();
  a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration;
};
</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "ALLOWALL",
      "Content-Security-Policy": "frame-ancestors *",
    },
  });
}
