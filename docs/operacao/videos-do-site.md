# Vídeos do produto

## Onde param as mídias

| Destino | Conteúdo | Versionado |
| --- | --- | --- |
| `docs/media/` | WebM VP9, posters JPG e `index.json`: material pronto para divulgação | Sim |
| `tests/capture/out/raw/` | WebM cru do Chromium e marcadores | Não |
| `tests/capture/out/master/` | MP4 H.264 CRF 14, sem perda de enquadramento para edição | Não |
| `tests/capture/out/fallback/` | MP4 H.264 compacto, útil para envio quando WebM não servir | Não |

O caminho de uma mídia é: cena em `tests/capture/record.ts` → bruto → `tests/capture/encode.ts` → `docs/media/`. Hoje o Garimpo não tem site de marketing que toque esses arquivos automaticamente; `docs/media/` é a fonte versionada para campanhas, landing pages e postagem. Quando houver uma página pública, ela deve copiar/servir esses mesmos arquivos e respeitar `index.json`.

## Suavidade

A fonte e o publicado usam 25 fps. A seta não depende de eventos `mousemove`: ela persegue a posição-alvo em `requestAnimationFrame`, o que preserva posições intermediárias mesmo que o CDP fique momentaneamente lento.

Antes de aprovar uma rodada, veja os seis WebM e meça ao menos um trecho de cursor com `mpdecimate` (comando em [captura de vídeo](../captura-de-video-de-produto.md)). Menos de cerca de 20 frames distintos por segundo em um deslocamento significa que a máquina estava carregada; regrave aquela cena. Próximas melhorias possíveis: reduzir cruzamentos longos de cursor, usar um master em 2× numa passada final e, se for necessário determinismo total, renderizar frame a frame em tempo virtual.
