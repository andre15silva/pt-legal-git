"""Minimal client for the Diário da República web app's JSON endpoints.

diariodarepublica.pt is an OutSystems app. Its pages load data with
`POST /dr/screenservices/dr/<Flow>/<Screen>/<Action>`, which answer anonymously
with the fixed public CSRF header every browser sends. There is no documented
API: the `apiVersion` hashes below change when the site is redeployed. The server
then returns `hasApiVersionChanged: true` with empty data, and this client raises
`StaleApiVersion`. Re-extract the hashes from the JS bundles listed by
`GET /dr/moduleservices/moduleinfo` (see docs/research/sources/diario-da-republica.md).

Be polite: cache every response, at most 1–2 requests per second.

    # Every version of an article of a consolidated diploma (here CIRC art. 87.º)
    python -I tools/dr_client.py historia 64205634 lei 2014-64205634 "Artigo 87.º"
    # The acts published in the 1.ª série on a day
    python -I tools/dr_client.py serie1 2025-11-07
"""
from __future__ import annotations

import html
import json
import re
import sys
import urllib.request

BASE = "https://diariodarepublica.pt/dr/screenservices/dr/"
MODULE_VERSION = "J7V1hYhO5HfBLPheagKZ6g"  # 2026-10-28
HEADERS = {
    "Content-Type": "application/json; charset=UTF-8",
    "Accept": "application/json",
    "X-CSRFToken": "T6C+9iB49TLra4jEsMeSckDMNhQ=",  # public anonymous token served to every browser
    "User-Agent": "redacao-phase0/0.1 (+https://github.com/andre15silva/pt-legal-git)",
}
LEGCONS = "LegislacaoConsolidada.LegCons_Detalhe"
# (endpoint, apiVersion, viewName), observed 2026-10-28.
EP = {
    "initial_date": ("LegislacaoConsolidada/LegCons_Detalhe/DataActionGetInitialDate", "2fs9w33A1a5ZYqnjhzLjew", LEGCONS),
    "frag_info": ("LegislacaoConsolidada/LegCons_Detalhe/DataActionGetDiplomaFragByIdAndApplicationSetting", "nc_pvjc74SJq_vOvUM4nCg", LEGCONS),
    "as_of": ("LegislacaoConsolidada/LegCons_Detalhe/DataActionGetData", "0J5toCe4aZFDi88AoH0G0Q", LEGCONS),
    "timeline": ("LegislacaoConsolidada/AlteracoesTimelineByDiplomaLegisId/DataActionGetConsolidacaoByDiplomaFrag", "kqtmWKfgghZe4WM2Y1nYAQ", LEGCONS),
    "versions": ("LegislacaoConsolidada/DiplomaByFragmentoVersaoId/ScreenDataSetGetVersoesByFragmentoId", "_+pYoyTeGysAq0H186JNuA", LEGCONS),
    "serie1": ("Home/WB_Serie1_List/DataActionGetDataAndApplicationSettings", "1ZNbiINloOPj8IhEJxM3QA", "Home.home"),
    "act": ("Legislacao_Conteudos/Conteudo_Detalhe/DataActionGetAllConteudoDetalheData", "B3l5BYZxaLmWUxGR3tmKGw", "Legislacao_Conteudos.Conteudo_Detalhe"),
}


class StaleApiVersion(RuntimeError):
    pass


def call(name: str, variables: dict, input_parameters: dict | None = None) -> dict:
    endpoint, api_version, view = EP[name]
    body = {"versionInfo": {"moduleVersion": MODULE_VERSION, "apiVersion": api_version},
            "viewName": view, "screenData": {"variables": variables}}
    if input_parameters is not None:
        body["inputParameters"] = input_parameters
    req = urllib.request.Request(BASE + endpoint, data=json.dumps(body).encode(), headers=HEADERS)
    with urllib.request.urlopen(req, timeout=180) as resp:
        payload = json.loads(resp.read())
    if "exception" in payload:
        raise RuntimeError(payload["exception"])
    if payload.get("versionInfo", {}).get("hasApiVersionChanged"):
        raise StaleApiVersion(f"{name}: the site was redeployed; re-extract apiVersion hashes")
    return payload["data"]


def diploma_header(frag_id: str, tipo: str, key: str) -> dict:
    return call("frag_info", {"Tipo": tipo, "Key": key, "DiplomaFragId": frag_id})


def as_of(frag_id: str, legis_id: str, date: str, header: dict) -> dict:
    return call("as_of", {"DiplomaFragId": frag_id, "DiplomaLegisId": legis_id, "DataSelecionada": date,
                          "FragmentoVersaoId": "0", "GetDiplomaFragByIdAndApplicationSetting": header})


def initial_date(frag_id: str, legis_id: str) -> dict:
    return call("initial_date", {"DiplomaFragId": frag_id, "DiplomaLegisId": legis_id})


def timeline(frag_id: str, legis_id: str, date: str) -> dict:
    return call("timeline", {"DiplomaLegisId": legis_id, "DiplomaFragId": frag_id, "Data": date, "ModificanteFragId": "0"})


def article_versions(fragment_version_id: str, frag_id: str, legis_id: str, date: str) -> list[dict]:
    data = call("versions", {"FragmentoVersaoId": fragment_version_id, "DiplomaFragId": frag_id,
                             "DataSelecionada": date, "DiplomaLegisId": legis_id}, {"StartIndex": 0, "MaxRecords": 50})
    return data["List"]["List"]


def plain(text: str | None) -> str:
    text = re.sub(r"<[^>]+>", "\n", html.unescape(text or ""))
    return re.sub(r"\n+", "\n", text).strip()


def historia(frag_id: str, tipo: str, key: str, artigo: str, date: str = "2026-10-28") -> list[dict]:
    """Every version of one article: [{em_vigor, publicado, ato, texto}], newest first."""
    header = diploma_header(frag_id, tipo, key)
    legis_id = header["ConsolidadaConteudoDetalhe"]["DiplomaLegis"]["Id"]
    fragments = as_of(frag_id, legis_id, date, header)["LegConsBase"]["List"]
    match = [f for f in fragments if f["ConsolidacaoFragmento"]["FullName"].endswith("> " + artigo)]
    if not match:
        raise LookupError(f"{artigo} not found in {key}")
    out = []
    for v in article_versions(match[-1]["FragmentoVersao"]["Id"], frag_id, legis_id, date):
        out.append({"em_vigor": v["DataEntradaVigor"][:10], "publicado": v["DataVersao"][:10],
                    "ato": re.sub(r"\[/?L\]", "", v["AssociacaoDescription"]), "texto": plain(v["Texto"])})
    return out


def main(argv: list[str]) -> int:
    if len(argv) >= 6 and argv[1] == "historia":
        print(json.dumps(historia(*argv[2:6]), ensure_ascii=False, indent=2))
    elif len(argv) == 3 and argv[1] == "serie1":
        print(json.dumps(call("serie1", {"HasFetched": False, "DataSelecionada": argv[2], "IsSumarioCompleto": True,
                                         "IsPageTracked": False}), ensure_ascii=False, indent=2))
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
