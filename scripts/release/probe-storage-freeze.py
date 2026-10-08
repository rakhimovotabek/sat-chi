"""Authorized hosted diagnostic; never claims a policy-only freeze is sufficient.

Creates/deletes only unique disposable Storage objects. Restrictive policies are
limited to those paths and removed in finally. No application migration runs.
Secrets are read in memory; evidence is written outside Git with mode 0600.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request
from urllib.parse import unquote, urlparse
import uuid


def environment(path):
    result = {}
    for line in path.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            name, value = line.split("=", 1)
            result[name.strip()] = value.strip().strip("'\"")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm-disposable-production-probe", action="store_true")
    parser.add_argument("--evidence-directory", required=True)
    args = parser.parse_args()
    if not args.confirm_disposable_production_probe:
        raise RuntimeError("Explicit disposable production probe flag required")
    repo = Path(__file__).resolve().parents[2]
    os.umask(0o077)
    evidence = Path(args.evidence_directory).expanduser().resolve()
    if evidence == repo or repo in evidence.parents:
        raise RuntimeError("Private evidence must be outside Git")
    evidence.mkdir(mode=0o700, parents=True, exist_ok=True)
    ref = "ileffhbbaomfimwulvpw"
    if (repo / "supabase/.temp/project-ref").read_text().strip() != ref:
        raise RuntimeError("Unexpected linked project")
    for name in [".env.local", ".env.e2e.local", ".supabase-db.local"]:
        private = repo / name
        if private.stat().st_mode & 0o077:
            raise RuntimeError("Private configuration must have mode 0600")
        if subprocess.run(["git", "check-ignore", "--quiet", str(private)], cwd=repo).returncode:
            raise RuntimeError("Private configuration must be ignored")
    config = environment(repo / ".env.local")
    base = "https://" + ref + ".supabase.co"
    if config.get("VITE_SUPABASE_URL") != base:
        raise RuntimeError("Frontend configuration does not match authorized project")
    api_key = config["VITE_SUPABASE_ANON_KEY"]
    connection = urlparse(environment(repo / ".supabase-db.local")["SUPABASE_DB_URL"])
    if ref not in (connection.hostname or "") + (connection.username or ""):
        raise RuntimeError("Database connection project mismatch")
    env = os.environ.copy()
    env.update(PGHOST=connection.hostname, PGPORT=str(connection.port or 5432),
               PGUSER=unquote(connection.username or ""), PGPASSWORD=unquote(connection.password or ""),
               PGDATABASE=connection.path.lstrip("/"), PGSSLMODE="require", PGCONNECT_TIMEOUT="15",
               LD_LIBRARY_PATH="/tmp/satchi-postgres17/opt/pgsql-17/lib")

    def sql(statement):
        result = subprocess.run(["/tmp/satchi-postgres17/opt/pgsql-17/bin/psql", "-X", "-At",
                                 "-v", "ON_ERROR_STOP=1", "-c", statement],
                                env=env, capture_output=True, text=True, timeout=40)
        if result.returncode:
            (evidence / "probe-sql.private.log").write_text(result.stderr)
            raise RuntimeError("SQL failed; see private diagnostic outside Git")
        return result.stdout.strip()

    def request(path, method="POST", body=None, jwt=None, raw=None, content_type="application/json"):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        headers = {"apikey": api_key, "Content-Type": content_type}
        if jwt:
            headers["Authorization"] = "Bearer " + jwt
        req = urllib.request.Request(base + path, method=method, data=data, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=25) as response:
                status, data = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, data = error.code, error.read()
        try:
            value = json.loads(data) if data else {}
        except ValueError:
            value = {}
        return status, value

    def successful(response):
        return 200 <= response[0] < 300

    policy_snapshot = "select coalesce(jsonb_agg(to_jsonb(p) order by policyname),'[]') from pg_policies p where schemaname='storage';"
    before = json.loads(sql(policy_snapshot))
    if sql("select mode from satchi_release.control where id") != "off":
        raise RuntimeError("Probe only runs on unchanged pre-migration off state")
    if sql("select count(*) from supabase_migrations.schema_migrations where version like '20261008%'") != "0":
        raise RuntimeError("Probe must not reopen an already migrated backend")
    credentials = json.loads((repo / ".env.e2e.local").read_text())["admin"]
    login = request("/auth/v1/token?grant_type=password", body=credentials)
    if not successful(login) or not login[1].get("access_token"):
        raise RuntimeError("Disposable administrator authentication failed")
    admin_token = login[1]["access_token"]
    keys = subprocess.run(["supabase", "projects", "api-keys", "--project-ref", ref, "--output", "json"],
                          cwd=repo, capture_output=True, text=True, timeout=40)
    if keys.returncode:
        raise RuntimeError("Authorized service credential unavailable")
    records = json.loads(keys.stdout)
    if isinstance(records, dict):
        records = records.get("api_keys", records.get("keys", []))
    service = next((row["api_key"] for row in records if row.get("name") == "service_role"), None)
    if not service:
        raise RuntimeError("Authorized Storage service credential unavailable")

    identity = uuid.uuid4()
    prefix = "_release-verification/" + str(identity) + "/"
    policy = "satchi_probe_" + identity.hex[:12]
    names = [prefix + name + ".webp" for name in ["baseline", "signed", "blocked", "service", "reopened"]]
    pixels = base64.b64decode("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA")
    report = {"project": ref, "prefix": prefix, "guaranteed_freeze": False}
    restriction_attempted = maintenance_attempted = False
    try:
        result = request("/storage/v1/object/question-assets/" + names[0], jwt=admin_token,
                         raw=pixels, content_type="image/webp")
        report["baseline_direct_upload_http"] = result[0]
        if not successful(result):
            raise RuntimeError("Baseline upload failed; probe inconclusive")
        signed = request("/storage/v1/object/upload/sign/question-assets/" + names[1],
                         jwt=admin_token, body={"upsert": False})
        report["premaintenance_sign_http"] = signed[0]
        if not successful(signed) or not signed[1].get("token"):
            raise RuntimeError("Baseline signed upload issuance failed")
        policy_sql = (repo / "scripts/release/storage-policy-probe.sql").read_text().replace("PROBE_POLICY", policy).replace("PROBE_PREFIX", prefix)
        restriction_attempted = True
        sql(policy_sql)
        maintenance_attempted = True
        sql("begin;set local lock_timeout='30s';select satchi_release.set_mode('maintenance');commit;")
        report["legacy_save_http"] = request("/rest/v1/rpc/save_book_practice", jwt=admin_token,
                                             body={"p_session_id": str(uuid.uuid4()), "p_answers": []})[0]
        direct = request("/storage/v1/object/question-assets/" + names[2], jwt=admin_token,
                         raw=pixels, content_type="image/webp")
        report["restricted_direct_upload_http"] = direct[0]
        report["restricted_direct_upload_error_status"] = direct[1].get("statusCode")
        fresh = request("/storage/v1/object/upload/sign/question-assets/" + names[2],
                        jwt=admin_token, body={"upsert": False})
        report["restricted_new_sign_http"] = fresh[0]
        preissued = request("/storage/v1/object/upload/sign/question-assets/" + names[1] + "?token=" + signed[1]["token"],
                            method="PUT", raw=pixels, content_type="image/webp")
        report["previously_issued_token_upload_http"] = preissued[0]
        report["previously_issued_token_created_object"] = sql("select count(*) from storage.objects where bucket_id='question-assets' and name='" + names[1] + "'") == "1"
        privileged = request("/storage/v1/object/question-assets/" + names[3], jwt=service,
                             raw=pixels, content_type="image/webp")
        report["service_role_upload_http"] = privileged[0]
        report["rls_only_freeze_disproved"] = (report["legacy_save_http"] == 503 and not successful(direct)
                                               and not successful(fresh) and successful(preissued)
                                               and report["previously_issued_token_created_object"] and successful(privileged))
    finally:
        # Attempt every cleanup even if another cleanup fails. Never drop existing policies.
        failures = []
        if restriction_attempted:
            try:
                sql("begin;" + "".join("drop policy if exists " + policy + "_" + action + " on storage.objects;" for action in ["insert", "update", "delete"]) + "commit;")
                report["original_policies_restored"] = json.loads(sql(policy_snapshot)) == before
                if not report["original_policies_restored"]:
                    failures.append("original policy verification")
            except Exception:
                failures.append("probe policy cleanup")
        if maintenance_attempted:
            try:
                sql("begin;set local lock_timeout='30s';select satchi_release.set_mode('off');commit;")
            except Exception:
                failures.append("pre-migration gate reopening")
        try:
            report["final_gate_mode"] = sql("select mode from satchi_release.control where id")
            if report["final_gate_mode"] != "off":
                failures.append("gate mode verification")
            reopened = request("/storage/v1/object/question-assets/" + names[4], jwt=admin_token,
                               raw=pixels, content_type="image/webp")
            report["reopened_direct_upload_http"] = reopened[0]
            if not successful(reopened):
                failures.append("reopened upload verification")
        except Exception:
            failures.append("reopening verification")
        try:
            deleted = request("/storage/v1/object/question-assets", method="DELETE", jwt=service, body={"prefixes": names})
            report["cleanup_http"] = deleted[0]
            report["remaining_disposable_objects"] = int(sql("select count(*) from storage.objects where bucket_id='question-assets' and starts_with(name,'" + prefix + "')"))
            if not successful(deleted) or report["remaining_disposable_objects"] != 0:
                failures.append("disposable cleanup verification")
        except Exception:
            failures.append("disposable asset cleanup")
        report["cleanup_failures"] = failures
        (evidence / "hosted-storage-freeze-probe.json").write_text(json.dumps(report, indent=2))
        print(json.dumps(report, indent=2))
        if failures:
            raise RuntimeError("Cleanup failed; preserve private evidence and stop release")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # urllib exception strings can contain signed URLs. Never print them.
        raise SystemExit("Storage probe stopped: " + type(error).__name__ + "; inspect private evidence. No migrations executed.")
