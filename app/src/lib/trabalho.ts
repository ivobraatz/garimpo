"use client";

// Estado do trabalho em andamento (baixar/gerar estados).
//
// Fica no nivel do app, e nao dentro da aba Base, por dois motivos: trocar de
// aba nao pode perder o acompanhamento, e a lista de estados precisa ser
// recarregada enquanto o pipeline escreve, para os contatos aparecerem sem
// esperar o fim.

import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { atualizar, estados as lerEstados, type EstadoDisponivel } from "./api";

export type Linha = { texto: string; fim: boolean; erro: boolean };

export type Trabalho = {
  rodando: boolean;
  ufs: string[];
  linhas: Linha[];
  /** Última linha útil, para o resumo na barra do topo. */
  ultima: string;
  iniciar: (ufs: string[], baixar: boolean, cidades: string[]) => Promise<void>;
  limparLog: () => void;
};

/** Enquanto roda, relê os estados neste intervalo. */
const INTERVALO_ATUALIZACAO = 4000;

export function useTrabalho(
  aoMudarEstados: (lista: EstadoDisponivel[]) => void,
  avisar: (texto: string, tipo?: "bom" | "ruim") => void,
): Trabalho {
  const [rodando, setRodando] = useState(false);
  const [ufs, setUfs] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const rodandoRef = useRef(false);

  // Um só ouvinte para o app inteiro, montado uma vez.
  useEffect(() => {
    const p = listen<Linha>("progresso", (e) => {
      setLinhas((l) => [...l.slice(-500), e.payload]);
    });
    return () => { p.then((desligar) => desligar()); };
  }, []);

  // Enquanto o pipeline escreve, a lista de estados é relida: assim um estado
  // recém-terminado aparece sozinho, sem precisar voltar à aba Base.
  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(() => {
      lerEstados().then(aoMudarEstados).catch(() => {});
    }, INTERVALO_ATUALIZACAO);
    return () => clearInterval(t);
  }, [rodando, aoMudarEstados]);

  const iniciar = useCallback(
    async (alvos: string[], baixar: boolean, cidades: string[]) => {
      if (rodandoRef.current) {
        avisar("Já existe um trabalho em andamento.", "ruim");
        return;
      }
      if (!alvos.length) {
        avisar("Escolha ao menos um estado.", "ruim");
        return;
      }
      rodandoRef.current = true;
      setRodando(true);
      setUfs(alvos);
      setLinhas([]);
      try {
        await atualizar(alvos, baixar, cidades);
        avisar(`${alvos.join(", ")} pronto${alvos.length > 1 ? "s" : ""}.`, "bom");
      } catch (e) {
        avisar(String(e), "ruim");
      } finally {
        rodandoRef.current = false;
        setRodando(false);
        lerEstados().then(aoMudarEstados).catch(() => {});
      }
    },
    [aoMudarEstados, avisar],
  );

  const ultima = [...linhas].reverse().find((l) => l.texto.trim())?.texto ?? "";

  return {
    rodando,
    ufs,
    linhas,
    ultima,
    iniciar,
    limparLog: () => setLinhas([]),
  };
}
