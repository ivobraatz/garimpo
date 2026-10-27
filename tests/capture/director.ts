import type { Locator, Page } from "@playwright/test";
import { tempo } from "./capture.config";

export type Marker = { t: number; kind: "start" | "end" | "action" | "note"; label: string };

/** A mão visível na gravação. O cursor real do Chromium não entra no WebM. */
export class Director {
  private begun = performance.now();
  readonly markers: Marker[] = [];
  constructor(private readonly page: Page) {}

  async ready() {
    await this.page.addStyleTag({ content: `
      #garimpo-cursor { position:fixed; z-index:2147483647; width:18px; height:18px;
        pointer-events:none; transform:translate(-2px,-2px); filter:drop-shadow(0 1px 2px #0008); }
      #garimpo-cursor::before { content:""; display:block; width:0; height:0;
        border-top:7px solid transparent; border-bottom:7px solid transparent; border-left:12px solid #101418;
        transform:rotate(-42deg); transform-origin:2px 7px; }
      #garimpo-click { position:fixed; z-index:2147483646; width:12px; height:12px; border:2px solid #14b8a6;
        border-radius:50%; pointer-events:none; opacity:0; transform:translate(-50%,-50%) scale(.4); }
      #garimpo-click[data-pulse] { animation:garimpo-pulse .42s ease-out; }
      @keyframes garimpo-pulse { 0%{opacity:.95;transform:translate(-50%,-50%) scale(.35)} 100%{opacity:0;transform:translate(-50%,-50%) scale(2.6)} }
    ` });
    await this.page.evaluate(() => {
      const cursor = document.createElement("i"); cursor.id = "garimpo-cursor";
      const click = document.createElement("i"); click.id = "garimpo-click";
      document.body.append(cursor, click);
      const state = { x: innerWidth * .56, y: innerHeight * .64, tx: innerWidth * .56, ty: innerHeight * .64 };
      (window as Window & { __garimpoCursor: typeof state }).__garimpoCursor = state;
      const tick = () => { state.x += (state.tx - state.x) * .32; state.y += (state.ty - state.y) * .32; cursor.style.left = `${state.x}px`; cursor.style.top = `${state.y}px`; requestAnimationFrame(tick); };
      tick();
    });
  }

  private t() { return Number(((performance.now() - this.begun) / 1000).toFixed(2)); }
  start(label: string) { this.markers.push({ t: this.t(), kind: "start", label }); }
  end() { this.markers.push({ t: this.t(), kind: "end", label: "fim" }); }
  mark(label: string) { this.markers.push({ t: this.t(), kind: "note", label }); }
  async hold(ms = tempo.hold) { await this.page.waitForTimeout(ms); }
  private async point(target: Locator) {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error("elemento sem posição para a captura");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  async move(target: Locator, label: string) {
    const p = await this.point(target);
    this.markers.push({ t: this.t(), kind: "action", label });
    await this.page.evaluate(({ x, y }) => { const s = (window as Window & { __garimpoCursor: { tx: number; ty: number } }).__garimpoCursor; s.tx = x; s.ty = y; }, p);
    await this.page.mouse.move(p.x, p.y, { steps: 4 });
    await this.page.waitForTimeout(tempo.move);
  }
  async click(target: Locator, label: string) {
    await this.move(target, label);
    await target.click();
    await this.page.evaluate(() => { const p = document.querySelector("#garimpo-click") as HTMLElement; const s = (window as Window & { __garimpoCursor: { x: number; y: number } }).__garimpoCursor; p.style.left = `${s.x}px`; p.style.top = `${s.y}px`; p.removeAttribute("data-pulse"); void p.offsetWidth; p.setAttribute("data-pulse", ""); });
    await this.page.waitForTimeout(180);
  }
  async type(target: Locator, text: string, label: string) {
    await this.click(target, label); await target.fill("");
    await target.pressSequentially(text, { delay: tempo.keystroke });
    this.markers.push({ t: this.t(), kind: "action", label: `digita ${label}` });
  }
}
