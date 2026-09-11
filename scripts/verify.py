#!/usr/bin/env python3
"""Check portable static-site references and optional inline JavaScript syntax."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'dist'

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.ids = set()
        self.refs = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.add(attrs['id'])
        for key in ('href', 'src', 'poster'):
            if attrs.get(key):
                self.refs.append(attrs[key])

def target_for(origin, ref):
    url = urlsplit(ref)
    if url.scheme or url.netloc:
        return None, ''
    if not url.path:
        return origin, unquote(url.fragment)
    base = PUBLIC if url.path.startswith('/') else origin.parent
    target = (base / unquote(url.path.lstrip('/'))).resolve()
    if not target.is_relative_to(PUBLIC.resolve()):
        raise ValueError('Reference escapes public directory: ' + ref)
    if target.is_dir():
        target /= 'index.html'
    return target, unquote(url.fragment)

def main():
    errors = []
    pages = {}
    scripts = 0
    for path in sorted(PUBLIC.glob('*.html')):
        text = path.read_text()
        pages[path] = Page(text)
        for js in re.findall(r'<script\b[^>]*>([\s\S]*?)</script>', text, re.I):
            if not js.strip():
                continue
            scripts += 1
            if shutil.which('node'):
                result = subprocess.run(['node', '--check'], input=js, text=True,
                                        capture_output=True)
                if result.returncode:
                    errors.append(path.name + ': ' + result.stderr)
    for path in (PUBLIC / 'index.html', PUBLIC / 'apparel.html'):
        if path not in pages:
            errors.append('Missing page: ' + path.name)
    for origin, page in pages.items():
        for ref in page.refs:
            try:
                target, anchor = target_for(origin, ref)
                if target is None:
                    continue
                if not target.exists():
                    errors.append(f'{origin.name}: missing {ref}')
                elif anchor and target.suffix == '.html':
                    parsed = pages.get(target) or Page(target.read_text())
                    if anchor not in parsed.ids:
                        errors.append(f'{origin.name}: missing anchor {ref}')
            except ValueError as exc:
                errors.append(str(exc))
    for path in list(PUBLIC.glob('*.css')) + list(pages):
        for ref in re.findall(r'url\(\s*[\'"]?([^\)\'"\s]+)', path.read_text()):
            target, _ = target_for(path, ref)
            if target is not None and not target.exists():
                errors.append(f'{path.name}: missing CSS resource {ref}')
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    print(f'PASS: {len(pages)} HTML pages, local links/anchors and CSS resources.')
    print(f'PASS: {scripts} inline scripts parsed by Node.' if shutil.which('node')
          else 'SKIPPED: JS syntax validation (Node not installed).')
    print('External URLs, email delivery, browser layout and asset permissions not tested.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
