# Captura de vídeo do produto

O Garimpo grava a própria interface para produzir mídia de divulgação, sem filmagem manual e sem usar contatos reais. O pipeline reaproveita o método aplicado no DataRunner, adaptado ao fato de o Garimpo ser um aplicativo Tauri.

## Planta em sete etapas

1. **Vitrine determinística.** `app/src/lib/capture-demo.ts` contém empresas fictícias, métricas e uma malha simples. Ela é injetada somente no contexto temporário do Chromium; a versão Tauri continua usando IPC com Rust.
2. **Servidor da interface.** `app/tests/capture/record.ts` sobe o Next local em `5180` e abre a mesma página React que chega ao aplicativo.
3. **Câmera.** O Playwright cria uma viewport fixa de 1440×900 e registra WebM cru a 25 fps.
4. **Direção.** `tests/capture/director.ts` adiciona uma seta visível. Ela suaviza a posição-alvo em `requestAnimationFrame`, porque o cursor do sistema não é incluído pelo screencast do Chromium.
5. **Roteiro.** As cenas são pequenas, estáveis e operam apenas controles pelo nome visível: busca e detalhe de um contato fictício, ramos e filtro, mapa e métrica. O arquivo de marcadores registra início, fim e capítulos.
6. **Codificação.** `encode.ts` corta pela marcação, publica WebM VP9 e poster JPEG, e preserva um MP4 master e um fallback H.264 fora da pasta publicada.
7. **Verificação.** Assista aos WebM, confirme que a seta aparece e meça os trechos em movimento. Só então use o material em site, rede social ou editor.

## Movimento

O cursor exibido é independente do mouse automatizado: a página mantém uma posição desenhada e uma posição-alvo. Em cada frame, aproxima uma da outra, evitando que a seta dê saltos quando a automação estiver ocupada.

```ts
state.x += (state.tx - state.x) * .32;
state.y += (state.ty - state.y) * .32;
requestAnimationFrame(tick);
```

O `Director.move()` calcula o centro do elemento, move o mouse real e atualiza `tx`/`ty`; antes de clicar ele espera `620 ms`. É intencionalmente mais lento que uma interação de teste: vídeos precisam de pausas para o olho registrar a mudança.

## Convenção de nomes

`<cena>.<tema>.webm`, por exemplo `contatos.claro.webm` e `mapa.escuro.webm`. A mesma base gera `.jpg` e uma entrada em `docs/media/index.json` com duração, resolução e peso.

## Ordem de construção e armadilhas

Construa nesta ordem: vitrine → cena de contatos → cursor → codificação → demais cenas → temas. Não grave a base do usuário; não clique em exportar, WhatsApp ou e-mail nas cenas; não use seletores de classe. O mapa usa uma malha didática local porque a finalidade é mostrar a interação e não substituir dados geográficos oficiais.

O WebM fonte é 25 fps, então o encoder também publica 25 fps. Para checar se há movimento novo de verdade, use:

```powershell
ffmpeg -ss 2 -t 2 -i tests/capture/out/raw/contatos.claro.webm -vf mpdecimate=hi=768:lo=320:frac=0.001 -an -f null -
```

Em máquinas carregadas, reduza as cenas, feche processos pesados e grave de novo. A codificação não inventa frames que não foram capturados.
