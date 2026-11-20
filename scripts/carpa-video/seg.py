import glob
import cv2
import numpy as np

FS = sorted(glob.glob("frames/f_*.png"))
H, W = 848, 504


def carregar(k):
    return cv2.imread(FS[k])


def disco(d):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (d, d))


# arcos do tanque (faixa de baixo): o peixe nunca chega la
ESTATICA = np.zeros((H, W), bool)
ESTATICA[775:, :] = True


def eixo_do_peixe(vermelho, comp):
    """Centro, direcao (cabeca para baixo) e meio-comprimento do corpo vermelho."""
    ys, xs = np.nonzero(vermelho & comp)
    centro = np.array([xs.mean(), ys.mean()])
    cov = np.cov(np.vstack([xs - centro[0], ys - centro[1]]))
    val, vec = np.linalg.eigh(cov)
    eixo = vec[:, 1]
    if eixo[1] < 0:
        eixo = -eixo
    return centro, eixo, 2.0 * np.sqrt(val[1])


def segmentar(bgr, thr=100, lacuna=11, area_max_extra=4500, branco_puro=244, abertura=9, margem_blob=8, folga_vermelho=8):
    mx = bgr.max(axis=2)
    b, g, r = bgr[..., 0].astype(int), bgr[..., 1].astype(int), bgr[..., 2].astype(int)
    vermelho = (r > 150) & (g < 110) & (b < 110)

    core = ((mx > thr) & ~ESTATICA).astype(np.uint8)
    core = cv2.morphologyEx(core, cv2.MORPH_CLOSE, disco(3))
    n, lab, st, _ = cv2.connectedComponentsWithStats(core, connectivity=8)
    principal, area = 0, -1
    for i in range(1, n):
        a = int(vermelho[lab == i].sum())
        if a > area:
            principal, area = i, a
    fish = lab == principal
    centro, eixo, meio = eixo_do_peixe(vermelho, fish)

    # pecas pequenas coladas no corpo (nadadeiras separadas por um fio escuro), so do lado da cabeca
    perto = cv2.dilate(fish.astype(np.uint8), disco(2 * lacuna + 1)).astype(bool)
    for i in range(1, n):
        if i == principal or st[i, cv2.CC_STAT_AREA] >= area_max_extra:
            continue
        comp = lab == i
        if not (comp & perto).any():
            continue
        cy, cx = np.nonzero(comp)
        if float(np.dot(np.array([cx.mean(), cy.mean()]) - centro, eixo)) > 0.05 * meio:
            fish |= comp

    # reflexos: manchas grossas de branco estourado, longe do vermelho, do lado da cauda
    puro = (bgr.min(axis=2) > branco_puro).astype(np.uint8)
    grosso = cv2.morphologyEx(puro, cv2.MORPH_OPEN, disco(abertura))
    nb, lb, sb, _ = cv2.connectedComponentsWithStats(grosso, connectivity=8)
    verm_perto = cv2.dilate(vermelho.astype(np.uint8), disco(2 * folga_vermelho + 1)).astype(bool)
    blobs = np.zeros_like(fish)
    for i in range(1, nb):
        comp = lb == i
        if sb[i, cv2.CC_STAT_AREA] > 250 and not (comp & verm_perto).any():
            cy, cx = np.nonzero(comp)
            if float(np.dot(np.array([cx.mean(), cy.mean()]) - centro, eixo)) < 0.15 * meio:
                blobs |= comp
    blobs_d = cv2.dilate(blobs.astype(np.uint8), disco(2 * margem_blob + 1)).astype(bool)
    fish &= ~blobs_d

    # mantem so a peca ligada ao corpo vermelho
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(fish.astype(np.uint8), connectivity=8)
    melhor, a2 = 0, -1
    for i in range(1, n2):
        a = int(vermelho[lab2 == i].sum())
        if a > a2:
            melhor, a2 = i, a
    fish = lab2 == melhor
    # fecha buracos internos (riscos escuros dentro do peixe)
    inv = (~fish).astype(np.uint8)
    n3, lab3, st3, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    for i in range(1, n3):
        x, y, w, h, a = st3[i]
        toca_borda = x == 0 or y == 0 or x + w == fish.shape[1] or y + h == fish.shape[0]
        if not toca_borda and a < 400:
            fish |= lab3 == i
    return fish, core.astype(bool), blobs_d
