import path from "node:path";

export const root = path.resolve(__dirname, "..", "..");
export const app = path.join(root, "app");
export const out = path.join(__dirname, "out");
export const media = path.join(root, "docs", "media");
export const url = "http://127.0.0.1:5180/?capture=1";

export const variants = (process.env.CAPTURE_VARIANTS ?? "claro,escuro")
  .split(",").map((nome) => nome.trim()).filter(Boolean);
export const only = new Set((process.env.CAPTURE_SCENES ?? "").split(",").map((nome) => nome.trim()).filter(Boolean));

export const viewport = { width: 1440, height: 900 };
export const tempo = { hold: 1050, move: 620, keystroke: 42 };
