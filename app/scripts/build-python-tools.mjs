import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const appDir = resolve(import.meta.dirname, "..");
const projectDir = resolve(appDir, "..");
const binariesDir = resolve(appDir, "src-tauri", "binaries");
const workDir = mkdtempSync(resolve(tmpdir(), "garimpo-pyinstaller-"));
const python = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const tools = ["ingestar_receita", "gerar_leads", "baixar_malha", "exportar"];

try {
  rmSync(binariesDir, { recursive: true, force: true });
  mkdirSync(binariesDir, { recursive: true });
  writeFileSync(resolve(binariesDir, ".gitkeep"), "");
  for (const tool of tools) {
    const result = spawnSync(
      python,
      [
        "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile",
        "--name", tool,
        "--paths", resolve(projectDir, "src"),
        "--distpath", binariesDir,
        "--workpath", resolve(workDir, "work", tool),
        "--specpath", resolve(workDir, "spec"),
        resolve(projectDir, "src", `${tool}.py`),
      ],
      { cwd: projectDir, encoding: "utf8" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
      process.exit(result.status ?? 1);
    }
    console.log(`Empacotado: ${tool}`);
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
