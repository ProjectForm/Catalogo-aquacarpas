# Carpa nadando (home)

Como o arquivo `public/carpa/orbita-v2.webp` foi feito a partir do video original "Carpa matriz.mp4" (504x848, fundo preto,
com marca d'agua do Instagram e reflexos brancos). Tudo roda fora do site; nada disto vai para a Vercel.

O recorte e **especifico deste video**: os quadros 14 a 38 sao os unicos em que a cauda aparece limpa (nos outros um reflexo
cobre a cauda ou o video corta a cauda na borda). Outro video pede nova escolha de quadros.

1. Ambiente: `python -m venv venv` e `venv/Scripts/pip install numpy pillow opencv-python-headless imageio-ffmpeg`
   (o `imageio-ffmpeg` traz o ffmpeg; use o `.exe` dentro de `venv/Lib/site-packages/imageio_ffmpeg/binaries/`).
2. Quadros: `ffmpeg -i "Carpa matriz.mp4" -fps_mode passthrough frames/f_%03d.png` (na mesma pasta dos scripts).
3. Recorte (so a carpa, sem marca d'agua/reflexos; brilho vermelho suave; fundo 0 = preto puro):
   `python final.py 26 0.85 14 38 cortes_c 0`
   - `seg.py` acha o corpo vermelho, mantem nadadeiras/cauda ligadas a ele e apaga as manchas brancas grossas (reflexos).
4. WebP animado com transparencia (preto -> transparente), vai e volta com desaceleracao nas pontas, cabeca para a direita:
   `python exporta_webp.py cortes_c 256 62 24 2.4` (largura 256 px, qualidade 62, 24 quadros/s, 2,4 s) e gera
   `orbita.webp` (~360 KB) e `orbita-parada.webp` (quadro parado para "reduzir movimento").
5. Ao trocar os arquivos, mude o nome (`orbita-v3.*`) e `CarpaNadando.tsx`: o cache e `immutable` por 1 ano.

Por que nao video: com fundo preto + `mix-blend-mode`, qualquer diferenca no nivel de preto do decodificador do aparelho
(ex.: 10 vs 14) aparece como caixa em volta da carpa. A transparencia de verdade nao depende disso.
