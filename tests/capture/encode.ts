import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { media, out } from "./capture.config";

function ffmpeg(args: string[]) { execFileSync("ffmpeg", ["-y", ...args], { stdio: "inherit" }); }
function probe(file: string) { return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" }).trim()); }

async function main() {
  const raw = path.join(out, "raw"); const master = path.join(out, "master"); const fallback = path.join(out, "fallback");
  await Promise.all([mkdir(media, { recursive: true }), mkdir(master, { recursive: true }), mkdir(fallback, { recursive: true })]);
  const names = (await readdir(raw)).filter((f) => f.endsWith(".markers.json")).map((f) => f.replace(".markers.json", "")).sort();
  const index: Record<string, unknown> = {};
  for (const name of names) {
    const input = path.join(raw, `${name}.webm`); const meta = JSON.parse(await readFile(path.join(raw, `${name}.markers.json`), "utf8")) as { scene: string; variant: string; markers: { t: number; kind: string }[] };
    const start = meta.markers.find((m) => m.kind === "start")?.t ?? 0;
    const end = Math.min(probe(input), (meta.markers.find((m) => m.kind === "end")?.t ?? probe(input)) + .35);
    const duration = Number((end - start).toFixed(2)); const published = path.join(media, `${name}.webm`);
    const trim = `trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=25,format=yuv420p`;
    ffmpeg(["-i", input, "-vf", trim, "-c:v", "libvpx-vp9", "-crf", "35", "-b:v", "0", "-row-mt", "1", "-an", published]);
    ffmpeg(["-i", input, "-vf", trim, "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-movflags", "+faststart", "-an", path.join(master, `${name}.mp4`)]);
    ffmpeg(["-i", input, "-vf", trim, "-c:v", "libx264", "-crf", "26", "-preset", "slow", "-movflags", "+faststart", "-an", path.join(fallback, `${name}.mp4`)]);
    ffmpeg(["-ss", String(start + .25), "-i", input, "-frames:v", "1", "-vf", "scale=1440:-2:flags=lanczos", "-q:v", "3", path.join(media, `${name}.jpg`)]);
    index[name] = { scene: meta.scene, variant: meta.variant, width: 1440, height: 900, duration, bytes: (await stat(published)).size };
    console.log(`✓ ${name}: ${duration}s`);
  }
  await writeFile(path.join(media, "index.json"), JSON.stringify(index, null, 2) + "\n");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
