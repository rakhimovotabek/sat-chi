"""Read-only database export. Secrets and data remain outside the checkout."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
from urllib.parse import urlparse, unquote, parse_qs

parser = argparse.ArgumentParser()
parser.add_argument("--destination", required=True)
parser.add_argument("--pg-bin", required=True)
parser.add_argument("--inserts", action="store_true", help="Use batched INSERT export instead of COPY through the pooler")
parser.add_argument("--credentials-file", help="Ignored owner-readable file with SUPABASE_DB_URL or SUPABASE_DB_PASSWORD")
args = parser.parse_args()
repo = Path(__file__).resolve().parents[2]
destination = Path(args.destination).expanduser().resolve()
if destination == repo or repo in destination.parents:
    raise SystemExit("Backups must be outside the Git checkout")
if (repo / "supabase/.temp/project-ref").read_text().strip() != "ileffhbbaomfimwulvpw":
    raise SystemExit("Unexpected Supabase project")
os.umask(0o077)
destination.mkdir(mode=0o700, parents=True, exist_ok=True)
folder = destination / datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
folder.mkdir(mode=0o700)
env = os.environ.copy()
env.update(PGCONNECT_TIMEOUT="20", PGOPTIONS="-c statement_timeout=0 -c lock_timeout=10000")
values = {}
if args.credentials_file:
    private = Path(args.credentials_file).expanduser().resolve()
    if private.stat().st_mode & 0o077:
        raise SystemExit("Credentials file must be owner-readable only (chmod600)")
    if repo in private.parents:
        ignored = subprocess.run(["git", "check-ignore", "--quiet", str(private)], cwd=repo)
        if ignored.returncode:
            raise SystemExit("Credentials file is not ignored by Git")
    for line in private.read_text().splitlines():
        if line.strip() and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
if not values.get("SUPABASE_DB_URL"):
    dry = subprocess.run(["supabase", "db", "dump", "--linked", "--dry-run"], cwd=repo, capture_output=True, text=True, check=True)
    for line in dry.stdout.splitlines():
        if line.startswith("export PG"):
            key, value = shlex.split(line[7:])[0].split("=", 1)
            if key in {"PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"}:
                env[key] = value
    if not all(env.get(key) for key in ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"]):
        raise SystemExit("CLI connection was unavailable; no credentials printed")
if values.get("SUPABASE_DB_URL"):
    connection = urlparse(values["SUPABASE_DB_URL"])
    if connection.scheme not in {"postgres", "postgresql"} or not connection.password:
        raise SystemExit("Expected a PostgreSQL URL with a database password")
    if "ileffhbbaomfimwulvpw" not in (connection.hostname or "") + (connection.username or ""):
        raise SystemExit("Connection URL does not identify the authorized project")
    env.update(PGHOST=connection.hostname, PGPORT=str(connection.port or 5432), PGUSER=unquote(connection.username or ""), PGPASSWORD=unquote(connection.password), PGDATABASE=connection.path.lstrip("/") or "postgres")
    env["PGSSLMODE"] = parse_qs(connection.query).get("sslmode", ["require"])[0]
elif values.get("SUPABASE_DB_PASSWORD"):
    env["PGPASSWORD"] = values["SUPABASE_DB_PASSWORD"]
    env["PGUSER"] = env["PGUSER"].removeprefix("cli_login_")
commands = [
    ["pg_dumpall", "--role=postgres", "--roles-only", "--no-role-passwords", "-f", str(folder / "roles.sql")],
    ["pg_dump", "--verbose", "--role=postgres", "--format=custom", "--no-owner", "--schema=public", "--schema=auth", "--schema=storage", "--schema=supabase_migrations", "--schema=satchi_release", *( ["--rows-per-insert=100"] if args.inserts else [] ), "-f", str(folder / "application.dump")],
]
for command in commands:
    with (folder / (command[0] + ".private.log")).open("w") as diagnostic:
        try:
            result = subprocess.run([str(Path(args.pg_bin) / command[0]), *command[1:]], env=env, stdout=subprocess.DEVNULL, stderr=diagnostic, timeout=900)
        except subprocess.TimeoutExpired:
            (folder / "FAILED.json").write_text(json.dumps({"export_verified": False, "restoration_verified": False, "command": command[0], "reason": "Export exceeded the 15-minute safety deadline"}))
            raise SystemExit(f"Export timed out; private diagnostic: {folder}. Backup is NOT verified.")
    if result.returncode:
        (folder / "FAILED.json").write_text(json.dumps({"export_verified": False, "restoration_verified": False, "command": command[0], "exit": result.returncode}))
        raise SystemExit(f"Export failed ({command[0]}); private diagnostic: {folder}. Backup is NOT verified.")
checksums = {name: hashlib.sha256((folder / name).read_bytes()).hexdigest() for name in ["application.dump", "roles.sql"]}
(folder / "export-manifest.json").write_text(json.dumps({"project": "ileffhbbaomfimwulvpw", "schemas": ["public", "auth", "storage", "supabase_migrations", "satchi_release (if installed)"], "sha256": checksums, "restoration_verified": False, "limitations": ["Storage object bytes are separate", "Provider-managed services/extensions and nonselected schemas need a managed recovery target", "Cluster role passwords intentionally excluded"]}, indent=2))
print(f"Export created: {folder}; restoration and Storage-file verification are still required.")
