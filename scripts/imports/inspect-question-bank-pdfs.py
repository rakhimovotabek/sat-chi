"""Read-only PDF inventory. Emits metadata/label booleans, never question text.

Usage: python3 scripts/imports/inspect-question-bank-pdfs.py [Desktop path]
Requires Poppler's pdfinfo and pdftotext; uses only five sampled pages per PDF.
"""

import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys


def inspect(desktop, filename):
    matches = sorted(p for p in desktop.iterdir() if p.is_file() and p.name.lower() == filename)
    if not matches:
        return {"requested": filename, "status": "NOT FOUND"}
    if len(matches) != 1:
        return {"requested": filename, "status": "AMBIGUOUS", "paths": [str(p) for p in matches]}
    path = matches[0]
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        signature = handle.read(5)
        handle.seek(0)
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    result = {"requested": filename, "path": str(path), "status": "FOUND", "bytes": path.stat().st_size, "sha256": digest.hexdigest(), "pdf_signature": signature == b"%PDF-"}
    info = subprocess.run(["pdfinfo", str(path)], capture_output=True, text=True, check=False)
    result["valid_pdf"] = result["pdf_signature"] and info.returncode == 0
    if not result["valid_pdf"]:
        return result
    result["metadata"] = dict(line.split(":", 1) for line in info.stdout.splitlines() if ":" in line)
    result["metadata"] = {k.strip(): v.strip() for k, v in result["metadata"].items()}
    pages = int(result["metadata"]["Pages"])
    labels = ["Question ID", "Assessment", "SAT", "Math", "Reading and Writing", "Correct Answer", "Rationale", "Difficulty"]
    result["sampled_pages"] = []
    for page in sorted({1, 2, max(1, pages // 2), max(1, pages - 1), pages}):
        # Text exists only in local process memory, is discarded after checking
        # structural labels, and is never printed, saved, uploaded or sent to AI.
        raw = subprocess.check_output(["pdftotext", "-f", str(page), "-l", str(page), str(path), "-"], stderr=subprocess.DEVNULL).decode(errors="replace")
        result["sampled_pages"].append({"page": page, "labels": {label: bool(re.search(re.escape(label), raw, re.IGNORECASE)) for label in labels}})
    result["limitations"] = "Sampled structural labels only; provenance, unique question totals, completeness and permissions are not established."
    return result


if __name__ == "__main__":
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Desktop"
    print(json.dumps({"method": "Read-only metadata, SHA-256 and sampled structural-label checks; no question content emitted.", "files": [inspect(root, name) for name in ["math.pdf", "english.pdf"]]}, indent=2))
