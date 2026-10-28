import json, sys

def lum(h):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def cr(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)

t = json.load(open(sys.argv[1]))
C = {x['name']: x['value'] for x in t['color']['tokens']}
pairs = [
    ('ink', ['paper', 'paper-raised', 'paper-sunken', 'ins-bg', 'del-bg', 'verde-soft', 'pendente-bg', 'aviso-bg'], 4.5),
    ('ink-muted', ['paper', 'paper-raised', 'paper-sunken'], 4.5),
    ('verde', ['paper', 'paper-raised', 'verde-soft'], 4.5),
    ('on-verde', ['verde'], 4.5),
    ('ins-ink', ['paper', 'paper-raised', 'ins-bg'], 4.5),
    ('del-ink', ['paper', 'paper-raised', 'del-bg'], 4.5),
    ('pendente', ['paper', 'paper-raised', 'pendente-bg'], 4.5),
    ('aviso', ['paper', 'paper-raised', 'aviso-bg'], 4.5),
    ('revogado', ['paper', 'paper-raised', 'paper-sunken'], 4.5),
    ('focus', ['paper', 'paper-raised', 'paper-sunken', 'verde-soft'], 3),
    ('rule-strong', ['paper', 'paper-raised'], 3),
    ('aviso-rule', ['paper', 'paper-raised'], 3),
    ('act-0', ['paper', 'paper-raised'], 2),
] + [(f'act-{i}', ['paper', 'paper-raised'], 3) for i in range(1, 8)]
bad = 0
for th in ('light', 'dark'):
    for fg, bgs, need in pairs:
        for bg in bgs:
            r = cr(C[fg][th], C[bg][th])
            if r < need:
                bad += 1
                print(f'FAIL {th:5} {fg:12} on {bg:12} {r:.2f} < {need}')
print("failures:", bad)
sys.exit(1 if bad else 0)
