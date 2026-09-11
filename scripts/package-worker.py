#!/usr/bin/env python3
"""Package the built Worker, assets and generated D1 migrations for hosting."""
from pathlib import Path
import argparse
import tarfile

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('archive')
args=parser.parse_args()
output=Path(args.archive).resolve()
if not output.is_relative_to(root):
    raise SystemExit('Archive must be inside this project')
build=root/'dist'
paths={'dist/client':build/'client','dist/server':build/'server',
       '.openai/hosting.json':build/'.openai/hosting.json',
       'dist/.openai':build/'.openai'}
for source in paths.values():
    if not source.exists() or source.is_symlink():
        raise SystemExit('Missing build output or unsupported symlink')
with tarfile.open(output,'w:gz') as tar:
    for destination,source in paths.items():
        tar.add(source,arcname=destination)
with tarfile.open(output) as tar:
    assert not any(item.issym() or item.islnk() for item in tar.getmembers())
    for required in ['dist/server/index.js','dist/client/index.html','.openai/hosting.json','dist/.openai/drizzle/meta/_journal.json']:
        assert tar.getmember(required).size>0
print('Validated Worker, public assets and root-level migration archive:',output)
