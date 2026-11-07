const express = require("express");
const { spawn } = require("child_process");
const { Readable } = require("stream");
const app = express();
const PORT = process.env.PORT || 3000;
const IA = "https://archive.org";

const manifest = {
  id: "dev.yourname.flac-aac-free",
  name: "Free FLAC + AAC (Internet Archive)",
  version: "1.3.0",
  resources: ["search", "stream"],
  checkValidLossless: 0,
  allowDownloads: 1,
  settings: [
  {
    key: "quality",
    type: "select",
    default: "LOSSLESS",
    options: [
      { label: "Lossless (FLAC)", value: "LOSSLESS" },
      { label: "Hi-Res (FLAC up to 24/96)", value: "HI_RES" },
      { label: "High (AAC 256)", value: "HIGH" },
      { label: "Low (AAC 128)", value: "LOW" },
    ],
  },
],

app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  next();
});

app.get("/", (req, res) => res.json(manifest));
app.get("/manifest.json", (req, res) => res.json(manifest));

// Search free Creative Commons FLAC music: /search?q=jazz
app.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").replace(/["\\()]/g, " ").trim();
    const query =
      `(${q || "music"}) AND mediatype:audio AND format:Flac ` +
      `AND licenseurl:*creativecommons*`;
    const url =
      `${IA}/advancedsearch.php?q=${encodeURIComponent(query)}` +
      `&fl[]=identifier&fl[]=title&fl[]=creator&rows=20&output=json`;
    const j = await (await fetch(url)).json();
    const results = j.response.docs.map((d) => ({
      id: d.identifier,
      title: d.title,
      artist: d.creator,
    }));
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: "search failed" });
  }
});

// Stream: /stream/<id>?quality=lossless|high|aac256|aac128&track=0
app.get("/stream/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^[\w.\-]+$/.test(id)) return res.sendStatus(400);

    const meta = await (await fetch(`${IA}/metadata/${id}`)).json();
    const kbps = (f) =>
  f.size && f.length ? (f.size * 8) / Number(f.length) / 1000 : 0;
let flacs = (meta.files || []).filter((f) =>
  f.name.toLowerCase().endsWith(".flac")
);
const good = flacs.filter((f) => kbps(f) >= 700);
if (good.length) flacs = good;flacs.sort((a, b) => kbps(b) - kbps(a));
    const track = flacs[parseInt(req.query.track || "0", 10)];
    if (!track) return res.sendStatus(404);

    const src = `${IA}/download/${id}/${encodeURIComponent(track.name)}`;
    const map = { LOSSLESS: "lossless", HI_RES: "high", HIGH: "aac256", LOW: "aac128" };
const q0 = String(req.query.quality || req.query.tier || "LOSSLESS");
const quality = map[q0.toUpperCase()] || q0;
    if (quality === "lossless") {
  const r = await fetch(src);
  if (!r.ok) return res.sendStatus(502);
  res.type("audio/flac");
  const len = r.headers.get("content-length");
  if (len) res.set("Content-Length", len);
  return Readable.fromWeb(r.body).pipe(res);
}

    const args = ["-i", src, "-vn"];
    if (quality === "high") {
      args.push("-ar", "96000", "-sample_fmt", "s32", "-f", "flac", "pipe:1");
      res.type("audio/flac");
    } else {
      const kbps = quality === "aac128" ? "128k" : "256k";
      args.push("-c:a", "aac", "-b:a", kbps, "-f", "adts", "pipe:1");
      res.type("audio/aac");
    }
    const ff = spawn("ffmpeg", args);
    ff.stdout.pipe(res);
    req.on("close", () => ff.kill("SIGKILL"));
  } catch (e) {
    res.status(500).json({ error: "stream failed" });
  }
});

app.get("/debug/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const meta = await (await fetch(`${IA}/metadata/${id}`)).json();
    const files = (meta.files || [])
      .filter((f) => f.name.toLowerCase().endsWith(".flac"))
      .map((f) => ({ name: f.name, size: f.size, length: f.length }));
    let head = null;
    if (files[0]) {
      const r = await fetch(
        `${IA}/download/${id}/${encodeURIComponent(files[0].name)}`,
        { method: "HEAD" }
      );
      head = r.status + " " + r.headers.get("content-type");
    }
    res.json({ flacCount: files.length, first: files.slice(0, 3), head });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
app.listen(PORT, () => console.log("Addon running on port " + PORT));
