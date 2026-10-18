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

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "deploy" / "worker_src.js"
KB = ROOT / "kb.json"
OUT = ROOT / "deploy" / "worker.js"


def main() -> int:
    src = SRC.read_text("utf-8")
    kb = json.loads(KB.read_text("utf-8"))

    slim = {
        "issues": [
            {
                "id": i.get("id"),
                "title": i.get("title"),
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
    if "__KB_JSON__" not in src:
        print("в worker_src.js нет метки __KB_JSON__", file=sys.stderr)
        return 1
    OUT.write_text(src.replace("__KB_JSON__", payload), "utf-8")
    print("готово: %s (%.1f КБ, тем %d)" % (OUT.relative_to(ROOT), OUT.stat().st_size / 1024, len(slim["issues"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
