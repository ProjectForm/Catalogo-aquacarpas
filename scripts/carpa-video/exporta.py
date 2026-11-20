import glob, os, shutil
import cv2
import numpy as np

fs = sorted(glob.glob("cortes_b/c_*.png"))
x0, x1, y0, y1 = [int(v) for v in np.load("bbox.npy")]
pad = 8
x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
x1, y1 = min(503, x1 + pad), min(847, y1 + pad)
LARG = 520
quadros = []
for f in fs:
    im = cv2.imread(f)[y0:y1 + 1, x0:x1 + 1]
    im = cv2.rotate(im, cv2.ROTATE_90_COUNTERCLOCKWISE)  # cabeca para a direita
    alt = int(round(im.shape[0] * LARG / im.shape[1]))
    alt += alt % 2
    quadros.append(cv2.resize(im, (LARG, alt), interpolation=cv2.INTER_AREA).astype(np.float32))
print("tamanho", LARG, alt, "quadros-fonte", len(quadros))

# vai e volta com desaceleracao nas pontas (cosseno), misturando quadros vizinhos: loop continuo e suave
T, FPS = 2.8, 30
N = int(round(T * FPS))
n = len(quadros) - 1
shutil.rmtree("seq", ignore_errors=True)
os.makedirs("seq")
for i in range(N):
    s = i / N
    u = 0.5 - 0.5 * np.cos(2 * np.pi * s)  # 0 -> 1 -> 0
    f = u * n
    a = int(np.floor(f))
    b = min(a + 1, n)
    t = f - a
    q = quadros[a] * (1 - t) + quadros[b] * t
    cv2.imwrite("seq/s_%03d.png" % i, np.clip(q + 0.5, 0, 255).astype(np.uint8))
print("saida", N, "quadros")
