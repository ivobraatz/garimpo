import { chromium, type Page } from "@playwright/test";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { app, only, out, tempo, url, variants, viewport } from "./capture.config";
import { Director } from "./director";

type Scene = { id: string; run: (page: Page, d: Director) => Promise<void> };
const byText = (page: Page, text: string) => page.getByRole("button", { name: text, exact: true });

const scenes: Scene[] = [
  { id: "contatos", run: async (page, d) => {
    await d.hold(500); d.start("lista de contatos"); d.mark("chapter: contatos"); await d.hold();
    await d.type(page.getByPlaceholder("nome, empresa, cidade…"), "metal", "busca"); await d.hold(850);
    await d.click(page.getByText("Metalúrgica Horizonte", { exact: true }), "abre o contato"); await d.hold(1700); d.end();
  } },
  { id: "ramos", run: async (page, d) => {
    await d.hold(500); await d.click(byText(page, "Ramos"), "abre ramos"); await d.hold(900); d.start("ramos"); d.mark("chapter: segmentos");
    await d.move(page.getByText("Metalurgia", { exact: true }).first(), "metalurgia"); await d.hold(1200);
    await d.click(page.getByText("Metalurgia", { exact: true }).first(), "filtra metalurgia"); await d.hold(1500); d.end();
  } },
  { id: "mapa", run: async (page, d) => {
    await d.hold(500); await d.click(byText(page, "Mapa"), "abre mapa"); await page.locator("canvas").waitFor(); await d.hold(1200); d.start("mapa de oportunidades"); d.mark("chapter: mapa");
    await d.click(page.getByLabel("Métrica do mapa"), "métrica"); await page.getByLabel("Métrica do mapa").selectOption("sem_dominio"); await d.hold(1500); d.end();
  } },
];

async function waitForServer() { for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); } throw new Error("o Next não respondeu na porta 5180"); }
async function main() {
  await mkdir(path.join(out, "raw"), { recursive: true });
  const server = spawn("npm.cmd", ["run", "dev"], { cwd: app, stdio: "inherit", shell: true });
  try {
    await waitForServer();
    const browser = await chromium.launch({ headless: true });
    for (const variant of variants) for (const scene of scenes.filter((s) => !only.size || only.has(s.id))) {
      const context = await browser.newContext({ viewport, recordVideo: { dir: path.join(out, "raw"), size: viewport }, colorScheme: variant === "escuro" ? "dark" : "light" });
      const page = await context.newPage(); await page.goto(url); const d = new Director(page); await d.ready();
      if (variant === "escuro") { await d.click(page.getByLabel("Ativar tema escuro"), "tema escuro"); await d.hold(350); }
      await scene.run(page, d); const video = page.video(); await page.close(); await context.close();
      if (!video) throw new Error(`vídeo ausente: ${scene.id}`);
      const name = `${scene.id}.${variant}`; await cp(await video.path(), path.join(out, "raw", `${name}.webm`));
      await writeFile(path.join(out, "raw", `${name}.markers.json`), JSON.stringify({ scene: scene.id, variant, viewport, markers: d.markers }, null, 2));
      console.log(`✓ ${name}`);
    }
    await browser.close();
  } finally { server.kill(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
