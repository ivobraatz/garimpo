import { chromium, type Page } from "@playwright/test";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { respostaDemo } from "../../app/src/lib/capture-demo";
import { app, only, out, tempo, url, variants, viewport } from "./capture.config";
import { Director } from "./director";

type Fixture = { estados: unknown; contatos: any[]; municipios: unknown; segmentos: unknown; brasil: unknown; parana: unknown; ajustes: unknown };
const fixture: Fixture = {
  estados: respostaDemo("estados", {}), contatos: (respostaDemo("buscar", { filtros: {} }) as any).itens,
  municipios: respostaDemo("municipios", { uf: "PR" }), segmentos: respostaDemo("segmentos", { uf: "PR" }),
  brasil: respostaDemo("malha", { nome: "malha_br.geojson" }), parana: respostaDemo("malha", { nome: "malha_41.geojson" }), ajustes: respostaDemo("ajustes", {}),
};

// O único mock fica no contexto temporário do Chromium. O bundle e o Tauri
// permanecem intactos; essa ponte existe apenas enquanto a câmera está aberta.
function instalarPonte(dados: Fixture) {
  (globalThis as any).__TAURI_INTERNALS__ = {
    invoke(comando: string, args: any = {}) {
      if (comando === "estados") return Promise.resolve(dados.estados);
      if (comando === "municipios") return Promise.resolve(dados.municipios);
      if (comando === "segmentos") return Promise.resolve(dados.segmentos);
      if (comando === "facetas") return Promise.resolve({ municipios: dados.municipios, segmentos: dados.segmentos });
      if (comando === "malha") return Promise.resolve(String(args.nome).includes("br") ? dados.brasil : dados.parana);
      if (comando === "garantir_malha" || comando === "atualizar" || comando === "definir_pasta_dados") return Promise.resolve();
      if (comando === "ajustes") return Promise.resolve(dados.ajustes);
      if (comando === "apagar_estado") return Promise.resolve(0);
      if (comando === "exportar") return Promise.resolve("C:\\Garimpo\\exportacao-demo.xlsx");
      if (comando === "buscar") {
        const f = args.filtros ?? {}; const termo = String(f.termo ?? "").toLocaleLowerCase();
        const itens = dados.contatos.filter((c) => (!termo || `${c.nome} ${c.empresa} ${c.cidade}`.toLocaleLowerCase().includes(termo)) && (!f.segmento || c.segmento === f.segmento) && (!f.score_minimo || c.score >= f.score_minimo) && (!f.somente_celular || !!c.whatsapp) && (!f.somente_email || !!c.email) && (!f.somente_sem_dominio || (!!c.email && !c.dominio_proprio)));
        return Promise.resolve({ total: termo || f.segmento || f.score_minimo ? itens.length : 10024, itens });
      }
      return Promise.reject(new Error(`IPC demo desconhecido: ${comando}`));
    },
  };
}

type Scene = { id: string; run: (page: Page, d: Director) => Promise<void> };
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const scenes: Scene[] = [
  { id: "contatos", run: async (page, d) => {
    await d.hold(500); d.start("lista de contatos"); d.mark("chapter: contatos"); await d.hold();
    await d.type(page.getByPlaceholder("nome, empresa, cidade…"), "metal", "busca"); await d.hold(850);
    await d.click(page.getByText("Metalúrgica Horizonte", { exact: true }), "abre o contato"); await d.hold(1700); d.end();
  } },
  { id: "ramos", run: async (page, d) => {
    await d.hold(500); await d.click(button(page, "Ramos"), "abre ramos"); await d.hold(900); d.start("ramos"); d.mark("chapter: segmentos");
    const metalurgia = page.getByText("Metalurgia", { exact: true }).first(); await d.move(metalurgia, "metalurgia"); await d.hold(1200);
    await d.click(metalurgia, "filtra metalurgia"); await d.hold(1500); d.end();
  } },
  { id: "mapa", run: async (page, d) => {
    await d.hold(500); await d.click(button(page, "Mapa"), "abre mapa"); await page.locator("canvas").waitFor(); await d.hold(1200); d.start("mapa de oportunidades"); d.mark("chapter: mapa");
    const metrica = page.getByLabel("Métrica do mapa"); await d.click(metrica, "métrica"); await metrica.selectOption("sem_dominio"); await d.hold(1500); d.end();
  } },
];
async function esperarServidor() { for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); } throw new Error("o Next não respondeu na porta 5180"); }
async function main() {
  await mkdir(path.join(out, "raw"), { recursive: true });
  const server = spawn("npm.cmd", ["run", "dev"], { cwd: app, stdio: "inherit", shell: true });
  try {
    await esperarServidor(); const browser = await chromium.launch({ headless: true });
    for (const variant of variants) for (const scene of scenes.filter((s) => !only.size || only.has(s.id))) {
      const context = await browser.newContext({ viewport, recordVideo: { dir: path.join(out, "raw"), size: viewport }, colorScheme: variant === "escuro" ? "dark" : "light" });
      await context.addInitScript(instalarPonte, fixture);
      const page = await context.newPage(); await page.goto(url); await page.getByText("Garimpo", { exact: true }).waitFor(); const d = new Director(page); await d.ready();
      if (variant === "escuro") { await d.click(page.getByLabel("Ativar tema escuro"), "tema escuro"); await d.hold(350); }
      await scene.run(page, d); const video = page.video(); await page.close(); await context.close();
      if (!video) throw new Error(`vídeo ausente: ${scene.id}`); const name = `${scene.id}.${variant}`;
      await cp(await video.path(), path.join(out, "raw", `${name}.webm`));
      await writeFile(path.join(out, "raw", `${name}.markers.json`), JSON.stringify({ scene: scene.id, variant, viewport, markers: d.markers }, null, 2)); console.log(`✓ ${name}`);
    }
    await browser.close();
  } finally { server.kill(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
