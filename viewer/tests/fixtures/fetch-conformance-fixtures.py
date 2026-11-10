#!/usr/bin/env python3
"""Vendor the shared KHR_character conformance fixtures at a pinned commit.

Usage: python3 fetch-conformance-fixtures.py [COMMIT]

Downloads Tools/fixtures/conformance/ from the public Kjakubzak/khr_character_testbed repository at
COMMIT (default: the commit in conformance/SOURCE.json) into ./conformance/, and records the source and
the SHA-256 of every file in conformance/SOURCE.json. viewer/tests/conformance.test.ts checks those
hashes, so an edited copy fails the tests. No credentials are needed; set GITHUB_TOKEN to avoid the
anonymous API rate limit when listing a new commit.
"""
import hashlib, json, os, shutil, sys, urllib.request

REPO = 'Kjakubzak/khr_character_testbed'
PREFIX = 'Tools/fixtures/conformance/'
HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, 'conformance')
SOURCE = os.path.join(DEST, 'SOURCE.json')


def get(url, api=False):
    headers = {'User-Agent': 'khr-character-testbed'}
    if api and os.environ.get('GITHUB_TOKEN'):
        headers['Authorization'] = 'Bearer ' + os.environ['GITHUB_TOKEN']
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers)) as response:
        return response.read()


def main():
    if len(sys.argv) > 1:
        commit = sys.argv[1]
    else:
        with open(SOURCE) as f:
            commit = json.load(f)['commit']
    if len(commit) != 40:
        sys.exit('Pass a full 40-character commit SHA.')
    tree = json.loads(get(f'https://api.github.com/repos/{REPO}/git/trees/{commit}?recursive=1', api=True))
    if tree.get('truncated'):
        sys.exit('The repository tree listing was truncated.')
    paths = sorted(t['path'] for t in tree['tree'] if t['type'] == 'blob' and t['path'].startswith(PREFIX))
    if not paths:
        sys.exit(f'No files under {PREFIX} at {commit}.')
    if os.path.isdir(DEST):
        shutil.rmtree(DEST)
    files = {}
    for path in paths:
        relative = path[len(PREFIX):]
        data = get(f'https://raw.githubusercontent.com/{REPO}/{commit}/{path}')
        target = os.path.join(DEST, relative)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, 'wb') as f:
            f.write(data)
        files[relative] = hashlib.sha256(data).hexdigest()
    with open(SOURCE, 'w') as f:
        json.dump({'repository': f'https://github.com/{REPO}', 'commit': commit, 'path': PREFIX,
                   'license': 'CC0-1.0 (see README.md)', 'files': files}, f, indent=2)
        f.write('\n')
    print(f'Wrote {len(files)} files from {REPO}@{commit} to {DEST}')


if __name__ == '__main__':
    main()
