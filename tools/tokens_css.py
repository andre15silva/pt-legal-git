"""Write design-system/tokens.css from design-system/tokens.json.

python -I tools/tokens_css.py design-system/tokens.json > design-system/tokens.css
Light colours go on :root and [data-theme="light"], dark ones on [data-theme="dark"].
"""
import json
import sys


def css(t):
    out = ["/* Redação — generated from tokens.json by tools/tokens_css.py */"]
    for theme, sel in (("light", ':root, [data-theme="light"]'), ("dark", '[data-theme="dark"]')):
        out.append(sel + " {")
        out.append("  color-scheme: %s;" % theme)
        for c in t["color"]["tokens"]:
            out.append("  --%s: %s;" % (c["name"], c["value"][theme]))
        for s in t["shadow"]["tokens"]:
            out.append("  --%s: %s;" % (s["name"], s["value"][theme]))
        out.append("}")
    out.append(":root {")
    for group in ("spacing", "radius", "size", "motion"):
        for x in t.get(group, {}).get("tokens", []):
            out.append("  --%s: %s;" % (x["name"], x["value"]))
    for k, v in t["type"]["families"].items():
        out.append("  --font-%s: %s;" % (k, v))
    out.append("}")
    for g in t["type"]["groups"]:
        for st in g["styles"]:
            rule = ".%s { font-family: var(--font-%s); font-size: %s; line-height: %s; font-weight: %s;" % (
                st["name"], g["family"], st["fontSize"], st["lineHeight"], st["fontWeight"])
            if st.get("letterSpacing"):
                rule += " letter-spacing: %s;" % st["letterSpacing"]
            out.append(rule + " }")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    sys.stdout.write(css(json.load(open(sys.argv[1], encoding="utf-8"))))
