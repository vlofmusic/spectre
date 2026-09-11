#!/usr/bin/env python3
"""Build the GitHub Pages presentation; the Worker source remains unchanged."""
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'dist'
OUTPUT = SOURCE / 'pages'


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Unexpected source markup: ' + old[:80])
    return text.replace(old, new, 1)


def build():
    if OUTPUT.is_symlink() or any(path.is_symlink() for path in SOURCE.iterdir()):
        raise ValueError('Refusing symlink in public source or output')
    if any(path.is_symlink() for path in (SOURCE / 'assets').rglob('*')):
        raise ValueError('Refusing symlink in public assets')
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()
    # Copy only authored public formats; never copy private docs, generated bundles,
    # database state, configuration, symlinks or credentials.
    for source in SOURCE.iterdir():
        if source.is_file() and source.suffix in {'.html', '.css', '.js'}:
            if source.name not in {'cart.js', 'checkout.js', 'catalog.js', 'cart.css', 'checkout.css'}:
                shutil.copy2(source, OUTPUT / source.name)
    shutil.copytree(SOURCE / 'assets', OUTPUT / 'assets')
    page = (OUTPUT / 'apparel.html').read_text()
    page = replace_once(page, '<body class="apparel-page">', '<body class="apparel-page" data-ordering="email">')
    page = re.sub(r'^.*(?:href="(?:cart|checkout)\.css|src="(?:cart|checkout|catalog)\.js).*(?:\n|$)', '', page, flags=re.M)
    page = re.sub(r'^.*<button[^>]*data-open-bag.*(?:\n|$)', '', page, flags=re.M)
    page = re.sub(r'^.*<button[^>]*data-add-to-bag.*(?:\n|$)', '', page, flags=re.M)
    page = replace_once(page, 'class="ap-direct-order" data-order', 'class="ap-button ap-button--light" data-glass-action data-order')
    page = replace_once(page, 'Or request your size by email', 'Request your size by email')
    page = page.replace('>Check stock</small>', '>Enquire</small>')
    page = replace_once(page, 'data-stock-status="loading"', 'data-stock-status="enquiry"')
    page = replace_once(page, 'Current availability is checked online. You can also enquire by email.', 'Choose a size to enquire. Availability is confirmed personally by email.')
    page = replace_once(page, 'Orders are currently arranged by message. Delivery cost, dispatch date and return terms are confirmed before you order.', 'Orders are arranged by email. No online payment or reservation is made here. We confirm availability, delivery and return terms before you order.')
    # Do not promote the unconfirmed Instagram placeholder on the public release.
    page = re.sub(r'^.*<p class="ap-instagram-note".*(?:\n|$)', '', page, flags=re.M)
    (OUTPUT / 'apparel.html').write_text(page)
    (OUTPUT / '.nojekyll').write_text('')
    print(f'GitHub Pages export: {OUTPUT}')
    print('Email enquiries only. No API calls, online checkout or stock reservations.')


if __name__ == '__main__':
    build()
