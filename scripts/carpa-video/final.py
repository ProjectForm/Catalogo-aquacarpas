import sys
import cv2
import numpy as np
from seg import carregar, segmentar, disco

INI = int(sys.argv[3]) if len(sys.argv) > 3 else 100
FIM = int(sys.argv[4]) if len(sys.argv) > 4 else 142
SAIDA = sys.argv[5] if len(sys.argv) > 5 else 'cortes'
GLOW = int(sys.argv[1]) if len(sys.argv) > 1 else 26    # alcance do brilho vermelho (px); 0 = sem brilho
FORCA = float(sys.argv[2]) if len(sys.argv) > 2 else 0.85
FUNDO = int(sys.argv[6]) if len(sys.argv) > 6 else 0   # piso de preto (0 = transparencia limpa)
BORDA = 34                   # desvanece nas bordas do video (a cauda sai do quadro)

# janela de borda: 1 no miolo, cai suavemente a 0 nas bordas
def janela(h, w, b):
    def rampa(n):
        t = np.clip(np.arange(n) / float(b), 0, 1)
        t = np.minimum(t, np.clip((n - 1 - np.arange(n)) / float(b), 0, 1))
        return t * t * (3 - 2 * t)
    return np.outer(rampa(h), rampa(w)).astype(np.float32)

JAN = janela(848, 504, BORDA)

def processar(k):
    bgr = carregar(k)
    fish, core, blobs = segmentar(bgr)
    f = fish.astype(np.uint8)
    peixe_suave = cv2.GaussianBlur(f.astype(np.float32), (0, 0), 1.1)
    if GLOW > 0:
        dist = cv2.distanceTransform(1 - f, cv2.DIST_L2, 5)
        halo = np.clip(1.0 - dist / GLOW, 0, 1) ** 1.6 * FORCA
        halo = cv2.GaussianBlur(halo, (0, 0), 2.0)
    else:
        halo = np.zeros_like(peixe_suave)
    w = np.maximum(peixe_suave, halo)
    intruso = core & ~fish  # qualquer coisa clara que nao seja o peixe (reflexos pequenos, restos, marca d'agua)
    bloqueio = cv2.dilate((blobs | ESTATICA_ | intruso).astype(np.uint8), disco(7)).astype(np.float32)
    bloqueio = np.where(cv2.dilate(f, disco(3)) > 0, np.minimum(bloqueio, (~intruso).astype(np.float32) * bloqueio), bloqueio)
    w = w * (1 - cv2.GaussianBlur(bloqueio, (0, 0), 2.0))
    w = w * JAN
    out = bgr.astype(np.float32) * w[..., None]
    out = np.maximum(out, FUNDO)
    return np.clip(out, 0, 255).astype(np.uint8), (w > 0.02)

from seg import ESTATICA as ESTATICA_

quadros, mascaras = [], []
for k in range(INI, FIM + 1):
    q, m = processar(k)
    quadros.append(q)
    mascaras.append(m)

uniao = np.zeros((848, 504), bool)
for m in mascaras:
    uniao |= m
ys, xs = np.nonzero(uniao)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
print("bbox", x0, x1, y0, y1)
np.save("bbox.npy", np.array([x0, x1, y0, y1]))
import os
os.makedirs(SAIDA, exist_ok=True)
for i, q in enumerate(quadros):
    cv2.imwrite(SAIDA + "/c_%03d.png" % i, q)
print(len(quadros))
