# Carpa nadando (video da home)

Como o arquivo `public/carpa/nadando-v1.mp4` foi feito a partir do video original "Carpa matriz.mp4" (504x848, fundo preto,
com marca d'agua do Instagram e reflexos brancos). Tudo roda fora do site; nada disto vai para a Vercel.

O recorte e **especifico deste video**: os quadros 14 a 38 sao os unicos em que a cauda aparece limpa (nos outros um reflexo
cobre a cauda ou o video corta a cauda na borda). Outro video pede nova escolha de quadros.

1. Ambiente: `python -m venv venv` e `venv/Scripts/pip install numpy pillow opencv-python-headless imageio-ffmpeg`
   (o `imageio-ffmpeg` traz o ffmpeg; use o `.exe` dentro de `venv/Lib/site-packages/imageio_ffmpeg/binaries/`).
2. Quadros: `ffmpeg -i "Carpa matriz.mp4" -fps_mode passthrough frames/f_%03d.png` (na mesma pasta dos scripts).
3. Recorte (so a carpa, sem marca d'agua/reflexos; brilho vermelho suave): `python final.py 26 0.85 14 38 cortes_b`
   - `seg.py` acha o corpo vermelho, mantem nadadeiras/cauda ligadas a ele e apaga as manchas brancas grossas (reflexos).
4. Boomerangue em vai e volta com desaceleracao nas pontas (84 quadros, 2,8 s), girado para a cabeca ficar a direita:
   `python exporta.py` (gera `seq/s_%03d.png`).
5. Codificar (fundo ~preto, a pagina mistura com `mix-blend-mode: lighten`):
   `ffmpeg -framerate 30 -i seq/s_%03d.png -vf "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p" -c:v libx264 -profile:v main -preset veryslow -crf 17 -movflags +faststart -an -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv nadando-v1.mp4`
   e o poster: primeiro quadro de `seq` salvo como WebP (qualidade 88).
6. Ao trocar o arquivo, mude o nome (`nadando-v2.*`) e `CarpaNadando.tsx`: o cache e `immutable` por 1 ano.
