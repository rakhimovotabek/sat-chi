"""Install pinned disposable-test tools in the user cache; never uses sudo/dotenv.
PostgreSQL builds from official source with two jobs. Existing verified archives
are reused. Full Supabase services/containers are not installed by this command.
"""
import hashlib
import json
import pathlib
import subprocess
import tarfile
import urllib.request

ROOT = pathlib.Path.home() / '.cache/satchi-test-tools'
DOWNLOADS = ROOT / 'downloads'
DOWNLOADS.mkdir(parents=True, exist_ok=True)


def download(url, path, digest):
    if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        urllib.request.urlretrieve(url, path)
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError('SHA-256 verification failed: ' + path.name)
    print(path.name + ': SHA-256 verified', flush=True)


def release(repo, tag, name, destination):
    with urllib.request.urlopen(f'https://api.github.com/repos/{repo}/releases/tags/{tag}', timeout=30) as response:
        metadata = json.load(response)
    asset = next(a for a in metadata['assets'] if a['name'] == name)
    digest = asset.get('digest', '')
    if not digest.startswith('sha256:'):
        raise ValueError('Official release asset has no SHA-256 digest')
    archive = DOWNLOADS / name
    download(asset['browser_download_url'], archive, digest[7:])
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive) as source:
        source.extractall(destination, filter='data')


release('PostgREST/postgrest', 'v14.1', 'postgrest-v14.1-linux-static-x86-64.tar.xz', ROOT / 'postgrest14')
release('supabase/auth', 'v2.197.0', 'auth-v2.197.0-amd64.tar.xz', ROOT / 'auth2197')
version = '17.11'
base = f'https://ftp.postgresql.org/pub/source/v{version}/postgresql-{version}.tar.bz2'
with urllib.request.urlopen(base + '.sha256', timeout=30) as response:
    digest = response.read().decode().split()[0]
archive = DOWNLOADS / f'postgresql-{version}.tar.bz2'
download(base, archive, digest)
source = ROOT / f'postgresql-{version}'
if not source.exists():
    with tarfile.open(archive) as package:
        package.extractall(ROOT, filter='data')
prefix = ROOT / 'pg17/opt/pgsql-17'
if not (prefix / 'bin/postgres').exists():
    with (source / 'setup-local.log').open('w') as log:
        for command in [
            ['./configure', f'--prefix={prefix}', '--without-icu', '--without-readline'],
            ['make', '-j2'], ['make', 'install'],
        ]:
            subprocess.run(command, cwd=source, stdout=log, stderr=subprocess.STDOUT, check=True)
for executable, args in [(prefix / 'bin/postgres', ['--version']), (ROOT / 'postgrest14/postgrest', ['--version'])]:
    subprocess.run([str(executable), *args], check=True)
print('Local cache ready. Run npm run test:sprint:native. No hosted configuration loaded.')
