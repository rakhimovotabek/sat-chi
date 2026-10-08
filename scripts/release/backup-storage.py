"""Download inventoried Storage objects; no remote writes or credential logging."""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import ssl
import time
import urllib.parse
import urllib.request

p = argparse.ArgumentParser()
p.add_argument("--inventory", required=True)
p.add_argument("--destination", required=True)
p.add_argument("--jobs", type=int, default=8)
p.add_argument("--limit", type=int, help="Diagnostic subset; never counts as a complete backup")
args = p.parse_args()
repo = Path(__file__).resolve().parents[2]
dest = Path(args.destination).expanduser().resolve()
if dest == repo or repo in dest.parents:
    raise SystemExit("Storage backups must be outside Git")
if (repo / "supabase/.temp/project-ref").read_text().strip() != "ileffhbbaomfimwulvpw":
    raise SystemExit("Unexpected Supabase project")
os.umask(0o077)
dest.mkdir(mode=0o700, parents=True, exist_ok=True)
dest.chmod(0o700)
for root, directories, _ in os.walk(dest):
    for directory in directories:
        (Path(root) / directory).chmod(0o700)
raw = json.loads(Path(args.inventory).read_text())
objects = raw["rows"][0]["inventory"] if isinstance(raw, dict) else raw
if args.limit:
    objects = objects[:args.limit]
keys = subprocess.run(["supabase", "projects", "api-keys", "--project-ref", "ileffhbbaomfimwulvpw", "--output", "json"], capture_output=True, text=True, check=True)
records = json.loads(keys.stdout)
if isinstance(records, dict): records = records.get("api_keys", records.get("keys", []))
key = next((r["api_key"] for r in records if r.get("name") == "service_role" and r.get("api_key", "").count(".") == 2), None)
if not key:
    raise SystemExit("An authorized server-side Storage backup credential is unavailable")

tls_context = ssl.create_default_context()

def copy(row):
    bucket, name = row["bucket_id"], row["name"]
    path = (dest / bucket / name).resolve()
    if dest not in path.parents or ".." in Path(name).parts:
        return {"bucket": bucket, "name": name, "ok": False, "reason": "Unsafe object path"}
    meta = row.get("metadata") or {}
    etag = str(meta.get("eTag", "")).strip('"')
    def verify(data):
        return ("size" not in meta or len(data) == int(meta["size"])) and (len(etag) != 32 or hashlib.md5(data).hexdigest() == etag)
    if path.is_file():
        data = path.read_bytes()
        if verify(data):
            return {"bucket": bucket, "name": name, "ok": True, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    for attempt in range(3):
        try:
            url = "https://ileffhbbaomfimwulvpw.supabase.co/storage/v1/object/authenticated/" + urllib.parse.quote(bucket, safe="") + "/" + urllib.parse.quote(name, safe="/")
            request = urllib.request.Request(url, headers={"apikey": key, "Authorization": "Bearer " + key, "Accept-Encoding": "identity"})
            with urllib.request.urlopen(request, timeout=20, context=tls_context) as response: data = response.read()
            if not verify(data): raise ValueError("Object does not match snapshot size/ETag")
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            partial = path.with_name(path.name + ".backup-part")
            partial.write_bytes(data)
            partial.replace(path)
            return {"bucket": bucket, "name": name, "ok": True, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        except Exception as error:
            failure = {"type": type(error).__name__, "status": getattr(error, "code", None)}
            if attempt < 2: time.sleep(attempt + 1)
    return {"bucket": bucket, "name": name, "ok": False, "reason": "Download or snapshot verification failed", "diagnostic": failure}

results = []
with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.jobs, 32))) as pool:
    pending = [pool.submit(copy, row) for row in objects]
    for future in concurrent.futures.as_completed(pending):
        result = future.result()
        results.append(result)
        if len(results) % 250 == 0:
            (dest / "storage-verification.private.json").write_text(json.dumps({"complete": False, "expected": len(objects), "verified": sum(r["ok"] for r in results), "objects": results}))
            print("Storage objects processed:", len(results), "verified:", sum(r["ok"] for r in results), flush=True)
report = {"complete": not bool(args.limit), "expected": len(objects), "verified": sum(r["ok"] for r in results), "objects": results}
(dest / "storage-verification.private.json").write_text(json.dumps(report))
print("Storage verified:", report["verified"], "of", report["expected"], flush=True)
if report["verified"] != report["expected"]: raise SystemExit(1)
