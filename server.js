const express = require("express");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;
const IA = "https://archive.org";

const manifest = {
  id: "dev.yourname.flac-aac-free3",
  name: "Free FLAC + AAC (Internet Archive)",
  version: "1.3.0",
  minAppVersion: 39,
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
};

app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  next();
});

app.get("/", (req, res) => res.json(manifest));
app.get("/manifest.json", (req, res) => res.json(manifest));

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

const toSec = (v) => {
  const s = String(v || "0");
  if (s.includes(":"))
    return s.split(":").reduce((a, p) => a * 60 + Number(p), 0);
  return Number(s) || 0;
};

const rate = (f) => {
  const sec = toSec(f.length);
  return f.size && sec ? (f.size * 8) / sec / 1000 : 0;
};

app.get("/stream/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^[\w.\-]+$/.test(id)) return res.sendStatus(400);

    const meta = await (await fetch(`${IA}/metadata/${id}`)).json();
    const flacs = (meta.files || [])
      .filter((f) => f.name.toLowerCase().endsWith(".flac"))
      .sort((a, b) => rate(b) - rate(a));
    const track = flacs[parseInt(req.query.track || "0", 10)];
    if (!track) return res.sendStatus(404);

    const src = `${IA}/download/${id}/${encodeURIComponent(track.name)}`;

    const map = { LOSSLESS: "lossless", HI_RES: "high", HIGH: "aac256", LOW: "aac128" };
    const q0 = String(req.query.quality || req.query.tier || "LOSSLESS");
    const quality = map[q0.toUpperCase()] || q0;

    if (quality === "lossless") return res.redirect(src);

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
    res.json({ flacCount: files.length, first: files.slice(0, 3) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => console.log("Addon running on port " + PORT));
