const express = require("express");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;
const IA = "https://archive.org";

const manifest = {
  id: "dev.yourname.flac-aac-free",
  name: "Free FLAC + AAC (Internet Archive)",
  version: "1.1.0",
  resources: ["search", "stream"],
  checkValidLossless: 0,
  allowDownloads: 1,
  settings: [
    {
      key: "quality",
      type: "select",
      default: "lossless",
      options: [
        { label: "Lossless (FLAC)", value: "lossless" },
        { label: "High (FLAC, up to 24/96)", value: "high" },
        { label: "AAC 256 kbps", value: "aac256" },
        { label: "AAC 128 kbps (data saver)", value: "aac128" },
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
    const quality = req.query.quality || "lossless";

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

app.listen(PORT, () => console.log("Addon running on port " + PORT));
