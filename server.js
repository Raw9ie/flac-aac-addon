const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
const LIBRARY = path.resolve(process.env.LIBRARY_DIR || "./music");
const PORT = process.env.PORT || 3000;

const manifest = {
  id: "dev.yourname.flac-aac",
  name: "FLAC + AAC Addon",
  version: "1.0.0",
  resources: ["search", "stream"],
  checkValidLossless: 1,
  allowDownloads: 1,
  settings: [
    {
      key: "quality",
      type: "select",
      default: "lossless",
      options: [
        { label: "Lossless (FLAC, up to 24/192)", value: "lossless" },
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

app.get("/search", (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  let files = [];
  try { files = fs.readdirSync(LIBRARY); } catch (e) {}
  const results = files
    .filter((f) => f.toLowerCase().endsWith(".flac") && f.toLowerCase().includes(q))
    .map((f) => ({ id: encodeURIComponent(f), title: path.parse(f).name }));
  res.json({ results });
});

app.get("/stream/:id", (req, res) => {
  const file = path.resolve(LIBRARY, decodeURIComponent(req.params.id));
  if (!file.startsWith(LIBRARY + path.sep) || !fs.existsSync(file)) {
    return res.sendStatus(404);
  }

  const quality = req.query.quality || "lossless";

  if (quality === "lossless") {
    res.type("audio/flac");
    return fs.createReadStream(file).pipe(res);
  }

  const args = ["-i", file, "-vn"];
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
});

app.listen(PORT, () => console.log("Addon running on port " + PORT));
