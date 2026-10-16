#!/usr/bin/env python3
"""Build the SvS Family Planner single-file page.

Injects config.json into planner.template.html (replacing /*__DATA__*/) and writes
planner.html + index.html + data.json. Creates a Zapier Storage secret (uuid4) on
first run and persists it in config.json so the shared sheet id never drifts.
"""
import json
import pathlib
import sys
import uuid

BASE = pathlib.Path(__file__).resolve().parent
CONFIG = BASE / "config.json"
TEMPLATE = BASE / "planner.template.html"


def main() -> int:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    store = cfg["meta"]["store"]
    created = False
    if not store.get("secret"):
        store["secret"] = str(uuid.uuid4())
        created = True

    tpl = TEMPLATE.read_text(encoding="utf-8")
    if "/*__DATA__*/" not in tpl:
        print("ERROR: template is missing the /*__DATA__*/ placeholder", file=sys.stderr)
        return 2

    data = json.dumps(cfg, ensure_ascii=False).replace("</", "<\\/")
    html = tpl.replace("/*__DATA__*/", "globalThis.__DATA__ = " + data + ";")

    if created:
        CONFIG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (BASE / "data.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (BASE / "planner.html").write_text(html, encoding="utf-8")
    (BASE / "index.html").write_text(html, encoding="utf-8")

    print("built planner.html + index.html + data.json")
    print("bytes:", len(html))
    print("store id created this run:", created)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
