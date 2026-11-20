import glob, os, shutil, sys
import cv2
import numpy as np
from PIL import Image

pasta = sys.argv[1] if len(sys.argv) > 1 else "cortes_c"
LARG = int(sys.argv[2]) if len(sys.argv) > 2 else 320
QUAL = int(sys.argv[3]) if len(sys.argv) > 3 else 78
fs = sorted(glob.glob(pasta + "/c_*.png"))
x0, x1, y0, y1 = [int(v) for v in np.load("bbox.npy")]
pad = 4
x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
x1, y1 = min(503, x1 + pad), min(847, y1 + pad)
quadros = []
for f in fs:
    im = cv2.imread(f)[y0:y1 + 1, x0:x1 + 1]
    im = cv2.rotate(im, cv2.ROTATE_90_COUNTERCLOCKWISE)  # cabeca para a direita
    alt = int(round(im.shape[0] * LARG / im.shape[1]))
    alt += alt % 2
    quadros.append(cv2.resize(im, (LARG, alt), interpolation=cv2.INTER_AREA).astype(np.float32))
print("sprite", LARG, alt, "quadros-fonte", len(quadros))

def rgba(bgr):
    """Preto -> transparente: o quadro e a carpa 'sobre preto', entao alpha = brilho maximo (com folga) e cor = quadro / alpha."""
    p = bgr[..., ::-1] / 255.0
    mx = p.max(axis=2)
    a = np.clip((mx - 0.015) / 0.32, 0, 1)
    c = np.where(a[..., None] > 0, p / np.maximum(a[..., None], 1e-6), 0)
    out = np.dstack([np.clip(c, 0, 1), a])
    return (out * 255 + 0.5).astype(np.uint8)

T = float(sys.argv[5]) if len(sys.argv) > 5 else 2.4
FPS = int(sys.argv[4]) if len(sys.argv) > 4 else 30
N = int(round(T * FPS))
n = len(quadros) - 1
imgs = []
for i in range(N):
    u = 0.5 - 0.5 * np.cos(2 * np.pi * i / N)  # 0 -> 1 -> 0, desacelera nas pontas
    f = u * n
    a = int(np.floor(f)); b = min(a + 1, n); t = f - a
    q = quadros[a] * (1 - t) + quadros[b] * t
    imgs.append(Image.fromarray(rgba(q), "RGBA"))
dur = int(round(1000 / FPS))
imgs[0].save("orbita.webp", save_all=True, append_images=imgs[1:], duration=dur, loop=0, quality=QUAL, alpha_quality=85, method=4, lossless=False)
imgs[0].save("orbita-parada.webp", quality=90, alpha_quality=90, method=6)
print("webp", os.path.getsize("orbita.webp"), "bytes;", len(imgs), "quadros;", dur, "ms")
