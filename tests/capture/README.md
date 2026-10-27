# Captura do Garimpo

Vídeos de divulgação saem da interface React real. O capturador abre o app em Chromium, dirige três histórias e codifica WebM leves para `docs/media/`.

Os dados são apenas a vitrine local definida em `app/src/lib/capture-demo.ts`, ativada exclusivamente por `?capture=1`. O aplicativo Tauri e seus bancos locais não são lidos, alterados ou exportados.

```powershell
cd app
npm run capture
```

O comando grava contatos, ramos e mapa nos temas claro e escuro. Para iterar uma tomada:

```powershell
$env:CAPTURE_SCENES = "contatos"
$env:CAPTURE_VARIANTS = "escuro"
npm run capture
```

Requer Node, FFmpeg e Chromium do Playwright. Caso seja a primeira máquina, execute `npx playwright install chromium`.

Consulte [a operação dos vídeos](../../docs/operacao/videos-do-site.md) para destinos, tamanho, publicação e a medição de suavidade.
