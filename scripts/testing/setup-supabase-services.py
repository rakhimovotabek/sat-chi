"""Cache pinned official linux/amd64 service root filesystems; no daemon/sudo.

Run with Python 3.12+. Runtime uses Bubblewrap user namespaces. The manifests
and every downloaded layer are SHA-256 checked before safe extraction.
"""
import hashlib
import json
import pathlib
import posixpath
import shutil
import subprocess
import tarfile
import urllib.request

ROOT = pathlib.Path.home() / '.cache/satchi-test-tools/services'
IMAGES = {
    'storage': ('supabase/storage-api', 'v1.81.0', '92c5fe87ba5291915d0c21ca530ece9a58e13cc76a36a6c84fc69121a8dde799'),
    'edge': ('supabase/edge-runtime', 'v1.77.4', 'fded42ff725708990b1a0803633c2659453259d075c4bec6b4d01dfb82dc055e'),
    'realtime': ('supabase/realtime', 'v2.143.3', '1591e9049bf15fd392da9e8344db892f6acfe9da274517327dbd14733f32b9e1'),
}


def verified(url, path, digest, headers):
    if not path.exists() or hashlib.file_digest(path.open('rb'), 'sha256').hexdigest() != digest:
        temporary = path.with_suffix('.download')
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=90) as response, temporary.open('wb') as output:
            shutil.copyfileobj(response, output)
        if hashlib.file_digest(temporary.open('rb'), 'sha256').hexdigest() != digest:
            raise ValueError('SHA-256 mismatch: ' + path.name)
        temporary.replace(path)
    return path


def install(name, repo, version, digest):
    destination = ROOT / name
    marker = destination / 'verified-image.json'
    if marker.exists() and json.loads(marker.read_text())['digest'] == digest:
        mountpoints(destination)
        print(name + ': pinned image already verified', flush=True)
        return
    downloads = ROOT / 'downloads'
    downloads.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen('https://auth.docker.io/token?service=registry.docker.io&scope=repository:' + repo + ':pull', timeout=45) as response:
        token = json.load(response)['token']
    headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json'}
    base = 'https://registry-1.docker.io/v2/' + repo
    manifest = json.loads(verified(base + '/manifests/sha256:' + digest, downloads / (digest + '.json'), digest, headers).read_bytes())
    staging = ROOT / (name + '.installing')
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir()
    for layer in manifest['layers']:
        sha = layer['digest'].removeprefix('sha256:')
        archive = verified(base + '/blobs/' + layer['digest'], downloads / (sha + '.tar.gz'), sha, headers)
        with tarfile.open(archive) as source:
            for member in source:
                # OCI absolute symlinks are made rootfs-relative. data_filter
                # then enforces that no member can escape the extraction root.
                if member.issym() and member.linkname.startswith('/'):
                    member.linkname = posixpath.relpath(member.linkname, '/' + posixpath.dirname(member.name))
                leaf = posixpath.basename(member.name)
                if leaf.startswith('.wh.'):
                    parent = staging / posixpath.dirname(member.name)
                    if not parent.resolve().is_relative_to(staging.resolve()):
                        raise ValueError('Unsafe whiteout')
                    targets = list(parent.iterdir()) if leaf == '.wh..wh..opq' and parent.exists() else [parent / leaf[4:]]
                    for target in targets:
                        if target.is_dir() and not target.is_symlink():
                            shutil.rmtree(target)
                        else:
                            target.unlink(missing_ok=True)
                elif not member.isdev():
                    source.extract(member, staging, filter='data')
        print(name + ': verified/extracted ' + sha[:12], flush=True)
    (staging / 'verified-image.json').write_text(json.dumps({'repository': repo, 'version': version, 'digest': digest}) + '\n')
    if destination.exists():
        shutil.rmtree(destination)
    staging.replace(destination)
    mountpoints(destination)


def mountpoints(destination):
    # Docker normally injects these; Bubblewrap needs existing bind targets on
    # a read-only root. They contain no host data until the runtime bind.
    for folder in ['work', 'functions']:
        (destination / folder).mkdir(exist_ok=True)
    for file in ['etc/resolv.conf', 'etc/hosts']:
        (destination / file).touch(exist_ok=True)


if __name__ == '__main__':
    if not shutil.which('bwrap'):
        raise SystemExit('Bubblewrap (bwrap) is required; no system packages are installed by this script.')
    for service, image in IMAGES.items():
        install(service, *image)
    pg = ROOT.parent / 'pg17/opt/pgsql-17'
    if not (pg / 'bin/pg_config').exists():
        raise SystemExit('Run npm run setup:test-tools first (native PostgreSQL is required).')
    if not (pg / 'lib/wal2json.so').exists():
        archive = verified('https://codeload.github.com/eulerto/wal2json/tar.gz/refs/tags/wal2json_2_7',
                           ROOT / 'downloads/wal2json-2.7.tar.gz',
                           'e6c12d02dc32e4d610dce33ee52ea85a54e12a563e79c4844508b6c061ff07a1', {})
        with tarfile.open(archive) as source:
            source.extractall(ROOT, filter='data')
        for target in ['all', 'install']:
            subprocess.run(['make', target, 'PG_CONFIG=' + str(pg / 'bin/pg_config')],
                           cwd=ROOT / 'wal2json-wal2json_2_7', check=True)
    print('Official services cached. No hosted settings or system services changed.')
