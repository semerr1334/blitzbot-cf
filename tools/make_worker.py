#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Собирает deploy/worker.js из deploy/worker_src.js и kb.json.

База знаний живёт в одном месте (kb.json): правишь её — пересобираешь Worker,
чтобы ответы в облаке и на сервере не разъехались.

    python3 tools/make_worker.py
"""

import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "deploy" / "worker_src.js"
KB = ROOT / "kb.json"
OUT = ROOT / "deploy" / "worker.js"


def latest_release() -> dict:
    """Ссылки последнего релиза на момент сборки — запасной вариант внутри воркера."""
    url = "https://api.github.com/repos/semerr1334/BlitzRelease1120/releases/latest"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "BlitzBot-build"})
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.loads(r.read().decode())
        info = {"tag": d.get("tag_name") or "", "apk": "", "hotfix": ""}
        for a in d.get("assets") or []:
            name = a.get("name") or ""
            if name.lower().endswith(".apk") and not info["apk"]:
                info["apk"] = a.get("browser_download_url") or ""
            elif "hotfix" in name.lower() and not info["hotfix"]:
                info["hotfix"] = a.get("browser_download_url") or ""
        return info
    except Exception as e:
        print("не смог прочитать релиз (%s) — оставлю пусто" % e, file=sys.stderr)
        return {"tag": "", "apk": "", "hotfix": ""}


def main() -> int:
    src = SRC.read_text("utf-8")
    kb = json.loads(KB.read_text("utf-8"))

    slim = {
        "issues": [
            {
                "id": i.get("id"),
                "title": i.get("title"),
                "short": i.get("short") or i.get("title"),
                "status": i.get("status"),
                "fixed_in": i.get("fixed_in"),
                "severe": bool(i.get("severe")),
                "strong": i.get("strong") or [],
                "keywords": i.get("keywords") or [],
                "answer": i.get("answer"),
                "answer_after_fix": i.get("answer_after_fix"),
                "ask": i.get("ask"),
            }
            for i in kb.get("issues", [])
        ],
        "log_signatures": [
            {"match": s.get("match"), "text": s.get("text"), "severe": bool(s.get("severe"))}
            for s in kb.get("log_signatures", [])
        ],
    }

    payload = json.dumps(slim, ensure_ascii=False, separators=(",", ":"))
    for marker in ("__KB_JSON__", "__FALLBACK_RELEASE__"):
        if marker not in src:
            print("в worker_src.js нет метки " + marker, file=sys.stderr)
            return 1
    rel = latest_release()
    src = src.replace("__FALLBACK_RELEASE__", json.dumps(rel, ensure_ascii=False))
    OUT.write_text(src.replace("__KB_JSON__", payload), "utf-8")
    print("релиз: %s" % (rel.get("tag") or "не найден"))
    print("готово: %s (%.1f КБ, тем %d)" % (OUT.relative_to(ROOT), OUT.stat().st_size / 1024, len(slim["issues"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
