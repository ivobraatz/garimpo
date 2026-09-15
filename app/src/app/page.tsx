"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertCircle, CheckCircle2, Database, Info, Layers, Map as MapIcon, Moon, Sun, Users,
} from "lucide-react";

import Base from "@/componentes/Base";
import Contatos from "@/componentes/Contatos";
import Marca from "@/componentes/Marca";
import Segmentos from "@/componentes/Segmentos";
import { estados as lerEstados, type EstadoDisponivel, type Filtros } from "@/lib/api";
import { useTrabalho } from "@/lib/trabalho";
import { mil } from "@/lib/formato";

// O MapLibre toca em window ao ser importado, então fica fora do build estático.
const Mapa = dynamic(() => import("@/componentes/Mapa"), {
  ssr: false,
  loading: () => <div className="vazio">preparando o mapa…</div>,
});

type Tela = "contatos" | "mapa" | "segmentos" | "base";
type Tema = "claro" | "escuro";

const ABAS = [
  { id: "contatos" as const, nome: "Contatos", Icone: Users },
  { id: "mapa" as const, nome: "Mapa", Icone: MapIcon },
  { id: "segmentos" as const, nome: "Ramos", Icone: Layers },
  { id: "base" as const, nome: "Base", Icone: Database },
];

export default function Pagina() {
  const [tela, setTela] = useState<Tela>("contatos");
  const [estados, setEstados] = useState<EstadoDisponivel[]>([]);
  const [uf, setUf] = useState("");
  const [filtrosVindos, setFiltrosVindos] = useState<Partial<Filtros> | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tipo?: "bom" | "ruim" } | null>(null);
  const [iniciando, setIniciando] = useState(true);
  const [tema, setTema] = useState<Tema>("claro");

  useEffect(() => {
    const salvo = window.localStorage.getItem("tema") as Tema | null;
    const escolhido = salvo === "escuro" || salvo === "claro"
      ? salvo
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
    setTema(escolhido);
    document.documentElement.dataset.tema = escolhido;
  }, []);

  const trocarTema = useCallback(() => {
    setTema((atual) => {
      const proximo = atual === "claro" ? "escuro" : "claro";
      document.documentElement.dataset.tema = proximo;
      window.localStorage.setItem("tema", proximo);
      return proximo;
    });
  }, []);

  const avisar = useCallback((texto: string, tipo?: "bom" | "ruim") => {
    setAviso({ texto, tipo });
    setTimeout(() => setAviso(null), 4200);
  }, []);

  const recarregarEstados = useCallback(async () => {
    try {
      const lista = await lerEstados();
      setEstados(lista);
      setUf((atual) => atual || lista[0]?.uf || "");
      if (!lista.length) setTela("base");
    } catch (e) {
      avisar(String(e), "ruim");
    } finally {
      setIniciando(false);
    }
  }, [avisar]);

  useEffect(() => { recarregarEstados(); }, [recarregarEstados]);

  // O trabalho vive aqui, acima das abas: trocar de aba não interrompe nem
  // perde o acompanhamento, e os estados são relidos enquanto ele roda.
  const trabalho = useTrabalho(setEstados, avisar);

  const abrirMunicipio = useCallback((ufAlvo: string, municipio: string) => {
    setUf(ufAlvo);
    setFiltrosVindos({ cidade: municipio, segmento: "" });
    setTela("contatos");
  }, []);

  const trocarUf = useCallback((ufAlvo: string) => {
    setFiltrosVindos(null);
    setUf(ufAlvo);
  }, []);

  const abrirSegmento = useCallback((segmento: string) => {
    setFiltrosVindos({ segmento, cidade: "" });
    setTela("contatos");
  }, []);

  const atual = estados.find((e) => e.uf === uf);
  const IconeAviso = aviso?.tipo === "bom"
    ? CheckCircle2
    : aviso?.tipo === "ruim" ? AlertCircle : Info;

  return (
    <div className="app">
      <header className="topo">
        <div className="marca">
          <Marca />
          <span>Garimpo</span>
        </div>

        {ABAS.map(({ id, nome, Icone }) => (
          <button key={id} className="aba" data-ativa={tela === id}
                  onClick={() => setTela(id)} type="button">
            <Icone size={14} />
            {nome}
          </button>
        ))}

        {trabalho.rodando && (
          <button className="trabalho" onClick={() => setTela("base")} type="button"
                  title="Ver o acompanhamento na aba Base">
            <span className="girando" />
            <b>{trabalho.ufs.join(" ")}</b>
            <span className="trabalho-linha">{trabalho.ultima}</span>
          </button>
        )}

        <div className="topo-direita">
          <button className="tema" onClick={trocarTema} type="button"
                  title={tema === "claro" ? "Ativar tema escuro" : "Ativar tema claro"}
                  aria-label={tema === "claro" ? "Ativar tema escuro" : "Ativar tema claro"}>
            {tema === "claro" ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          {atual && (
            <span className="contexto">
              <b>{mil(atual.contatos)}</b> contatos
            </span>
          )}
          {estados.length > 1 && (
            <select className="escolha" style={{ width: "auto" }} value={uf}
                    onChange={(e) => trocarUf(e.target.value)} aria-label="Estado">
              {estados.map((e) => <option key={e.uf} value={e.uf}>{e.uf}</option>)}
            </select>
          )}
        </div>
      </header>

      <main style={{ minHeight: 0 }}>
        {iniciando && <div className="vazio">abrindo a base…</div>}

        {!iniciando && !uf && tela !== "base" && (
          <div className="vazio">
            <Database size={22} />
            <strong>Nenhum estado na base.</strong>
            <span>Vá em Base e baixe o primeiro.</span>
          </div>
        )}

        {!iniciando && uf && tela === "contatos" && (
          <Contatos
            uf={uf}
            ufs={estados.map((e) => e.uf)}
            aoTrocarUf={trocarUf}
            filtrosIniciais={filtrosVindos}
            avisar={avisar}
          />
        )}

        {!iniciando && uf && tela === "mapa" && (
          <Mapa tema={tema} uf={uf} estadosDisponiveis={estados} aoEscolherMunicipio={abrirMunicipio} />
        )}

        {!iniciando && uf && tela === "segmentos" && (
          <Segmentos uf={uf} aoEscolher={abrirSegmento} />
        )}

        {!iniciando && tela === "base" && (
          <Base
            estados={estados}
            ufAtual={uf}
            aoTrocarUf={(u) => { trocarUf(u); setTela("contatos"); }}
            aoTerminar={recarregarEstados}
            avisar={avisar}
            trabalho={trabalho}
          />
        )}
      </main>

      {aviso && (
        <div className="aviso" data-tipo={aviso.tipo}>
          <IconeAviso size={14} />
          {aviso.texto}
        </div>
      )}
    </div>
  );
}
