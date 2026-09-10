"use client";

// Mapa coroplético com MapLibre.
//
// O que faz um mapa temático parecer real não é a biblioteca, é o contexto: os
// estados vizinhos por baixo, o oceano com cor própria, os nomes das cidades
// grandes e uma barra de escala. Sem isso a malha flutua no vazio.
//
// Os rótulos são marcadores HTML, não uma camada de símbolos: camada de texto
// no MapLibre exige um servidor de glifos SDF, que não existe offline.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapaGL, type LngLatBoundsLike } from "maplibre-gl";
import { ChevronRight, Loader2 } from "lucide-react";

import {
  CODIGO_UF, garantirMalha, malha, municipios, type ContagemArea,
} from "@/lib/api";
import { mil, pct } from "@/lib/formato";
import estilos from "./Mapa.module.css";

type Metrica = "contatos" | "sem_dominio" | "com_celular" | "score_medio";

const METRICAS: { valor: Metrica; nome: string }[] = [
  { valor: "contatos", nome: "Total de contatos" },
  { valor: "sem_dominio", nome: "Sem domínio próprio" },
  { valor: "com_celular", nome: "Com celular" },
  { valor: "score_medio", nome: "Score médio" },
];

// Rampa sequencial de teal, do quase-branco ao escuro. Uma cor só: em mapa
// temático, várias matizes confundem ordem com categoria.
const RAMPA = ["#f0fdfa", "#ccfbf1", "#99f6e4", "#5eead4",
               "#2dd4bf", "#14b8a6", "#0d9488", "#0f766e", "#134e4a"];

const OCEANO = "#eef2f5";
const TERRA_VIZINHA = "#e4e7ea";
const CONTORNO_VIZINHO = "#d3d7dc";

const ESTILO_BASE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "oceano", type: "background", paint: { "background-color": OCEANO } }],
};

function limites(geo: GeoJSON.FeatureCollection): LngLatBoundsLike {
  let oeste = 180, sul = 90, leste = -180, norte = -90;
  const varrer = (c: unknown): void => {
    if (typeof (c as number[])[0] === "number") {
      const [x, y] = c as number[];
      oeste = Math.min(oeste, x); leste = Math.max(leste, x);
      sul = Math.min(sul, y); norte = Math.max(norte, y);
      return;
    }
    (c as unknown[]).forEach(varrer);
  };
  geo.features.forEach((f) => f.geometry && varrer((f.geometry as never)["coordinates"]));
  return [[oeste, sul], [leste, norte]];
}

/** Ponto mais adequado para pousar o rótulo: centro do maior anel da feição. */
function centro(feicao: GeoJSON.Feature): [number, number] | null {
  const g = feicao.geometry;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return null;
  const poligonos = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let melhor: number[][] | null = null;
  let maior = -1;
  for (const p of poligonos) {
    const anel = p[0] as number[][];
    if (anel.length > maior) { maior = anel.length; melhor = anel; }
  }
  if (!melhor) return null;
  let x = 0, y = 0;
  for (const [a, b] of melhor) { x += a; y += b; }
  return [x / melhor.length, y / melhor.length];
}

export default function Mapa({
  uf,
  estadosDisponiveis,
  aoEscolherMunicipio,
}: {
  uf: string;
  estadosDisponiveis: { uf: string; contatos: number }[];
  aoEscolherMunicipio: (ufAlvo: string, municipio: string) => void;
}) {
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  const marcadores = useRef<maplibregl.Marker[]>([]);
  const enquadre = useRef<LngLatBoundsLike | null>(null);
  const malhas = useRef(new Map<string, Promise<GeoJSON.FeatureCollection>>());
  const garantias = useRef(new Map<string, Promise<void>>());
  const mexeu = useRef(false);
  const [pronto, setPronto] = useState(false);
  const [nivel, setNivel] = useState<"brasil" | "uf">(
    estadosDisponiveis.length > 1 ? "brasil" : "uf",
  );
  const [ufMapa, setUfMapa] = useState(uf);
  const [metrica, setMetrica] = useState<Metrica>("contatos");
  const [contagens, setContagens] = useState<ContagemArea[]>([]);
  const [sob, setSob] = useState<ContagemArea | null>(null);
  const [cidadeSelecionada, setCidadeSelecionada] = useState<ContagemArea | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    setUfMapa(uf);
    setCidadeSelecionada(null);
  }, [uf]);

  const carregarMalha = useCallback((nome: string) => {
    const existente = malhas.current.get(nome);
    if (existente) return existente;

    const carregamento = malha(nome).catch((erro) => {
      malhas.current.delete(nome);
      throw erro;
    });
    malhas.current.set(nome, carregamento);
    return carregamento;
  }, []);

  const baixarMalha = useCallback((ufAlvo: string) => {
    const existente = garantias.current.get(ufAlvo);
    if (existente) return existente;

    const garantia = garantirMalha(ufAlvo).finally(() => {
      garantias.current.delete(ufAlvo);
    });
    garantias.current.set(ufAlvo, garantia);
    return garantia;
  }, []);

  const carregarMalhaUf = useCallback(async (ufAlvo: string) => {
    const codigo = CODIGO_UF[ufAlvo];
    if (!codigo) throw new Error(`UF inválida: ${ufAlvo}`);
    const nome = `malha_${codigo}.geojson`;
    try {
      return await carregarMalha(nome);
    } catch {
      await baixarMalha(ufAlvo);
      return carregarMalha(nome);
    }
  }, [baixarMalha, carregarMalha]);

  const carregarMalhaBrasil = useCallback(async () => {
    try {
      return await carregarMalha("malha_br.geojson");
    } catch {
      await baixarMalha(uf);
      return carregarMalha("malha_br.geojson");
    }
  }, [baixarMalha, carregarMalha, uf]);

  useEffect(() => {
    const codigo = CODIGO_UF[uf];
    if (!pronto || !codigo) return;
    void carregarMalhaUf(uf).catch(() => {});
  }, [pronto, uf, carregarMalhaUf]);

  useEffect(() => {
    if (!div.current || mapa.current) return;
    const m = new maplibregl.Map({
      container: div.current,
      style: ESTILO_BASE,
      center: [-51, -15],
      zoom: 3,
      attributionControl: false,
      dragRotate: false,
      maxPitch: 0,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    m.addControl(
      new maplibregl.ScaleControl({ maxWidth: 110, unit: "metric" }),
      "bottom-right",
    );
    m.on("load", () => setPronto(true));
    mapa.current = m;

    // Assim que o usuário arrasta ou dá zoom, o enquadramento passa a ser dele.
    const marcarMexeu = () => { mexeu.current = true; };
    m.on("dragstart", marcarMexeu);
    m.on("zoomstart", marcarMexeu);

    // O canvas fica num grid e só ganha o tamanho final depois que o MapLibre
    // já mediu o container. Sem avisar do novo tamanho, a vista mostra bem mais
    // área do que o fitBounds pediu. E como o observer costuma disparar no meio
    // da animação, o enquadramento é reaplicado aqui -- sem animação, e só
    // enquanto o usuário não tiver movido o mapa por conta própria.
    const observador = new ResizeObserver(() => {
      m.resize();
      if (enquadre.current && !mexeu.current) {
        m.fitBounds(enquadre.current, { padding: 56, duration: 0 });
      }
    });
    observador.observe(div.current);

    return () => {
      observador.disconnect();
      m.off("dragstart", marcarMexeu);
      m.off("zoomstart", marcarMexeu);
      m.remove();
      mapa.current = null;
    };
  }, []);

  const maximo = useMemo(
    () => Math.max(...contagens.map((c) => Number(c[metrica] ?? 0)), 1),
    [contagens, metrica],
  );

  const limparMarcadores = useCallback(() => {
    marcadores.current.forEach((m) => m.remove());
    marcadores.current = [];
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !pronto) return;
    let cancelado = false;

    (async () => {
      setCarregando(true);
      setSob(null);

      const dados = nivel === "brasil"
        ? estadosDisponiveis.map((e) => ({
            codigo: CODIGO_UF[e.uf] ?? "", nome: e.uf, contatos: e.contatos,
            com_email: 0, com_celular: 0, sem_dominio: 0, score_medio: 0,
          }))
        : await municipios(ufMapa);

      const geo = nivel === "brasil"
        ? await carregarMalhaBrasil()
        : await carregarMalhaUf(ufMapa);
      const brasil = nivel === "brasil" ? geo : await carregarMalhaBrasil();
      if (cancelado) return;

      const porCodigo = new Map(dados.map((d) => [String(d.codigo), d]));
      const max = Math.max(...dados.map((d) => Number(d[metrica] ?? 0)), 1);

      const enriquecido: GeoJSON.FeatureCollection = {
        ...geo,
        features: geo.features.map((f) => {
          const codigo = String((f.properties as Record<string, unknown>)?.codarea ?? "");
          const item = porCodigo.get(codigo);
          const valor = item ? Number(item[metrica] ?? 0) : -1;
          return {
            ...f,
            id: Number(codigo) || undefined,
            properties: {
              ...f.properties,
              nome: item?.nome ?? "",
              temDado: item ? 1 : 0,
              // Raiz quadrada: numa escala linear as capitais tomam a rampa
              // inteira e o resto do estado vira um tom só.
              intensidade: item ? Math.sqrt(Math.max(valor, 0) / max) : 0,
            },
          };
        }),
      };

      // Contexto por baixo: o país inteiro em cinza, para a malha não flutuar.
      const fonteContexto = m.getSource("contexto") as maplibregl.GeoJSONSource | undefined;
      if (fonteContexto) {
        fonteContexto.setData(brasil);
      } else {
        m.addSource("contexto", { type: "geojson", data: brasil });
        m.addLayer({
          id: "contexto-terra", type: "fill", source: "contexto",
          paint: { "fill-color": TERRA_VIZINHA },
        });
        m.addLayer({
          id: "contexto-borda", type: "line", source: "contexto",
          paint: { "line-color": CONTORNO_VIZINHO, "line-width": 0.8 },
        });
      }

      const fonte = m.getSource("areas") as maplibregl.GeoJSONSource | undefined;
      if (fonte) {
        fonte.setData(enriquecido);
      } else {
        m.addSource("areas", { type: "geojson", data: enriquecido });
        m.addLayer({
          id: "preenchimento", type: "fill", source: "areas",
          paint: {
            "fill-color": [
              "case",
              ["==", ["get", "temDado"], 0], "#f7f8f9",
              ["interpolate", ["linear"], ["get", "intensidade"],
                0, RAMPA[0], 0.14, RAMPA[1], 0.28, RAMPA[2], 0.42, RAMPA[3],
                0.56, RAMPA[4], 0.7, RAMPA[5], 0.82, RAMPA[6], 0.92, RAMPA[7],
                1, RAMPA[8]],
            ],
          },
        });
        m.addLayer({
          id: "contorno", type: "line", source: "areas",
          paint: {
            "line-color": [
              "case", ["boolean", ["feature-state", "sob"], false],
              "#101418", "#ffffff",
            ],
            "line-width": [
              "case", ["boolean", ["feature-state", "sob"], false], 2, 0.7,
            ],
          },
        });
      }

      // Rótulos das maiores áreas, como marcadores HTML.
      limparMarcadores();
      const maiores = [...dados]
        .sort((a, b) => b.contatos - a.contatos)
        .slice(0, nivel === "brasil" ? 27 : 12);
      const nomesRotulados = new Set(maiores.map((d) => d.nome));
      for (const f of enriquecido.features) {
        const nome = String(f.properties?.nome ?? "");
        if (!nomesRotulados.has(nome)) continue;
        const ponto = centro(f);
        if (!ponto) continue;
        const el = document.createElement("div");
        el.className = estilos.rotulo;
        el.textContent = nome;
        marcadores.current.push(
          new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat(ponto)
            .addTo(m),
        );
      }

      setContagens(dados);
      // resize antes do enquadramento: o fitBounds usa o tamanho que o mapa
      // conhece no momento da chamada.
      m.resize();
      const caixa = limites(geo);
      enquadre.current = caixa;
      mexeu.current = false;
      m.fitBounds(caixa, { padding: 56, duration: 220 });
      setCarregando(false);
    })();

    return () => { cancelado = true; };
  }, [
    pronto, nivel, ufMapa, metrica, estadosDisponiveis, limparMarcadores,
    carregarMalhaBrasil, carregarMalhaUf,
  ]);

  useEffect(() => limparMarcadores, [limparMarcadores]);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !pronto) return;
    let atual: string | number | undefined;

    const mover = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || !f.properties?.temDado) return;
      if (atual !== undefined) m.setFeatureState({ source: "areas", id: atual }, { sob: false });
      atual = f.id;
      if (atual !== undefined) m.setFeatureState({ source: "areas", id: atual }, { sob: true });
      setSob(contagens.find((c) => c.nome === String(f.properties!.nome)) ?? null);
      m.getCanvas().style.cursor = "pointer";
    };

    const sair = () => {
      if (atual !== undefined) {
        m.setFeatureState({ source: "areas", id: atual }, { sob: false });
        atual = undefined;
      }
      setSob(null);
      m.getCanvas().style.cursor = "";
    };

    const clicar = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || !f.properties?.temDado) return;
      const nome = String(f.properties.nome);
      if (nivel === "brasil") {
        setCidadeSelecionada(null);
        setUfMapa(nome);
        setNivel("uf");
      } else {
        setCidadeSelecionada(contagens.find((c) => c.nome === nome) ?? null);
      }
    };

    m.on("mousemove", "preenchimento", mover);
    m.on("mouseleave", "preenchimento", sair);
    m.on("click", "preenchimento", clicar);
    return () => {
      m.off("mousemove", "preenchimento", mover);
      m.off("mouseleave", "preenchimento", sair);
      m.off("click", "preenchimento", clicar);
    };
  }, [pronto, nivel, ufMapa, contagens, aoEscolherMunicipio]);

  const ordenadas = useMemo(
    () => [...contagens].sort((a, b) => Number(b[metrica]) - Number(a[metrica])),
    [contagens, metrica],
  );

  const irPara = (item: ContagemArea) => {
    if (nivel === "brasil") {
      setCidadeSelecionada(null);
      setUfMapa(item.nome);
      setNivel("uf");
    } else {
      setCidadeSelecionada(item);
    }
  };

  const totalVisivel = contagens.reduce((s, c) => s + c.contatos, 0);
  const foco = cidadeSelecionada ?? sob;

  return (
    <div className={estilos.tela}>
      <div className={estilos.mapa}>
        <div ref={div} className={estilos.canvas} />

        <div className={estilos.barraFlutuante}>
          <nav className={estilos.trilha}>
            <button onClick={() => { setCidadeSelecionada(null); setNivel("brasil"); }} type="button"
                    data-ativa={nivel === "brasil"}>
              Brasil
            </button>
            {nivel === "uf" && (
              <>
                <ChevronRight size={13} className={estilos.chevron} />
                <span className={estilos.trilhaAtual}>{ufMapa}</span>
              </>
            )}
          </nav>

          <select
            className={estilos.metrica}
            value={metrica}
            onChange={(e) => setMetrica(e.target.value as Metrica)}
            aria-label="Métrica do mapa"
          >
            {METRICAS.map((m) => (
              <option key={m.valor} value={m.valor}>{m.nome}</option>
            ))}
          </select>

          {carregando && (
            <span className={estilos.carregando}>
              <Loader2 size={13} className={estilos.girando} />
            </span>
          )}
        </div>

        <div className={estilos.escala}>
          <span className={estilos.escalaRotulo}>
            {METRICAS.find((m) => m.valor === metrica)?.nome}
          </span>
          <div className={estilos.rampa}>
            {RAMPA.map((c) => <i key={c} style={{ background: c }} />)}
          </div>
          <div className={estilos.escalaTexto}>
            <span className="mono">0</span>
            <span className="mono">
              {metrica === "score_medio" ? maximo.toFixed(0) : mil(Math.round(maximo))}
            </span>
          </div>
        </div>
      </div>

      <aside className={estilos.lado}>
        <div className={estilos.painelArea}>
          <span className={estilos.areaNome}>
            {foco ? foco.nome : nivel === "brasil" ? "Brasil" : ufMapa}
          </span>
          <span className={`${estilos.areaNumero} num`}>
            {mil(foco ? foco.contatos : totalVisivel)}
          </span>
          <span className={estilos.areaLegenda}>
            {foco
              ? "contatos"
              : `contatos em ${mil(contagens.length)} ${nivel === "brasil" ? "estados" : "municípios"}`}
          </span>

          {foco && nivel === "uf" ? (
            <>
            <dl className={estilos.mini}>
              <div>
                <dt>com celular</dt>
                <dd className="mono">{pct(foco.com_celular, foco.contatos)}</dd>
              </div>
              <div>
                <dt>com e-mail</dt>
                <dd className="mono">{pct(foco.com_email, foco.contatos)}</dd>
              </div>
              <div>
                <dt>sem domínio</dt>
                <dd className="mono">{pct(foco.sem_dominio, foco.contatos)}</dd>
              </div>
              <div>
                <dt>score médio</dt>
                <dd className="mono">{foco.score_medio.toFixed(1)}</dd>
              </div>
            </dl>
            {cidadeSelecionada && (
              <button
                className={`botao botao--principal ${estilos.verContatos}`}
                onClick={() => aoEscolherMunicipio(ufMapa, cidadeSelecionada.nome)}
                type="button"
              >
                Ver contatos de {cidadeSelecionada.nome}
              </button>
            )}
            </>
          ) : (
            <p className={estilos.instrucao}>
              {nivel === "brasil"
                ? "Clique num estado para abrir os municípios."
                : "Clique numa cidade para ver os indicadores e abrir os contatos."}
            </p>
          )}
        </div>

        <div className={estilos.rankTopo}>Maiores</div>
        <ol className={estilos.ranking}>
          {ordenadas.slice(0, 30).map((item, i) => {
            const v = Number(item[metrica] ?? 0);
            return (
              <li key={item.codigo || item.nome}>
                <button onClick={() => irPara(item)} type="button"
                        data-foco={cidadeSelecionada?.nome === item.nome}>
                  <span className={`${estilos.posicao} mono`}>{i + 1}</span>
                  <span className={estilos.rankNome}>{item.nome}</span>
                  <span className={estilos.rankBarra}>
                    <i style={{ width: `${Math.max((v / maximo) * 100, 2)}%` }} />
                  </span>
                  <span className={`${estilos.rankValor} mono`}>
                    {metrica === "score_medio" ? v.toFixed(1) : mil(v)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}
