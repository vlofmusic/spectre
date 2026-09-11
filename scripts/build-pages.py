#!/usr/bin/env python3
"""Keep shared GitHub URLs pointing to the complete server-backed website."""
from pathlib import Path
from urllib.parse import urlsplit
import argparse
import html
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'dist' / 'pages'


def build(origin):
    url = urlsplit(origin)
    if url.scheme != 'https' or not url.netloc or url.username or url.password or url.path not in ('', '/') or url.query or url.fragment:
        raise ValueError('Provide an HTTPS site origin without a path or credentials')
    if OUTPUT.is_symlink():
        raise ValueError('Refusing symlink output')
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()
    for name in ['index', 'apparel', 'about', 'work']:
        destination = origin.rstrip('/') + '/' + ('' if name == 'index' else name + '.html')
        safe = html.escape(destination, quote=True)
        title = 'Spectre' if name == 'index' else 'Spectre — ' + name.title()
        page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title><meta http-equiv="refresh" content="0;url={safe}"><link rel="canonical" href="{safe}">
<meta name="robots" content="noindex"><style>body{{margin:0;min-height:100svh;display:grid;place-items:center;background:#18191b;color:#fff;font:18px Helvetica,Arial,sans-serif}}a{{color:inherit;padding:24px}}</style>
</head><body><a href="{safe}">Continue to {title} ↗</a><script>
const destination = new URL({json.dumps(destination)});
destination.search = location.search;
destination.hash = location.hash;
location.replace(destination.href);
</script></body></html>
'''
        (OUTPUT / (name + '.html')).write_text(page)
    (OUTPUT / '.nojekyll').write_text('')
    print('Built GitHub entry pages for the complete site:', origin)
    print('Publish only after the destination and live cart have passed verification.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site-origin', required=True)
    build(parser.parse_args().site_origin)
