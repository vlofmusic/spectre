# Spectre

Studio website, apparel page and selected CGI work. Vanilla HTML/CSS/JavaScript with a
Cloudflare Worker and D1 for hoodie availability, 30-minute reservations and Telegram
order-request notifications.

Requests are enquiries: they do not collect payment or complete a sale. Stripe is not connected.

## Local development

Use Node.js 24 and pnpm 10. Install the locked dependencies:

```sh
pnpm install --frozen-lockfile
pnpm db:local
```

For a **new, empty local database only**, initialise the stock:

```sh
pnpm exec wrangler d1 execute spectre-reservations --local --file db/seed-local.sql
```

Do not re-seed an existing shop or use this local seed to overwrite production stock.
Start the local server:

```sh
pnpm dev
```

Open <http://127.0.0.1:8000/>. Other routes: `/apparel`, `/about`, `/work`.
Changes to files trigger live reload. Use Wrangler; a static Python server cannot run the APIs.

## Telegram notifications

The local connection helper keeps the token out of browser URLs, source code and console output:

```sh
pnpm telegram:setup
```

Open the local URL it prints and follow the steps with your own bot. It saves `.dev.vars`,
which is ignored by Git. Restart `pnpm dev` after connecting. `.dev.vars.example` lists the
required setting names without credentials. Set production values through the hosting
provider's secret settings; never commit them or expose them in frontend JavaScript.

## Source layout

- `dist/*.html`, `dist/*.css`, `dist/*.js`, `dist/assets/`: authored frontend source.
- `server/`: Worker APIs, reservation logic and order notifications.
- `db/`: Drizzle schema and separate initial local inventory data.
- `drizzle/`: generated schema migrations.
- `scripts/`: build, verification and local setup tools.
- `.openai/hosting.json`: existing Sites project and logical database binding.

Do not remove the whole `dist` directory as build output. Only its nested `client/`,
`server/` and `.openai/` directories are generated and excluded from Git. Original incoming
media, private project notes, local databases, credentials and separate bot deliverables
are not included in this repository.

## Verification and build

```sh
python3 scripts/verify.py
node --test scripts/test-reservations.mjs scripts/test-orders.mjs
pnpm build
```

The build writes public assets to `dist/client`, bundles the Worker in `dist/server`
and copies deployment metadata and schema migrations into `dist/.openai`. It does not deploy.

## Hosting

The complete experience needs a Cloudflare Workers-compatible runtime and a D1 database.
Before enabling production enquiries, configure the database, migrations, initial stock,
Telegram secrets and the applicable privacy information. Local state is never uploaded
as part of a source release.

The complete server-backed site is hosted at
https://spectre-studio-refresh.riabchenko-vla995208.chatgpt.site/.
Its current audience is controlled in Sites; do not assume it is public.

GitHub Pages cannot execute the reservation or checkout APIs. The previous email-only
export removed required features and is superseded. Build GitHub entry pages with:

```sh
python3 scripts/build-pages.py --site-origin https://spectre-studio-refresh.riabchenko-vla995208.chatgpt.site
```

These preserve incoming page links and fragments by forwarding to the complete site.
Publish `dist/pages` to the `codex/github-pages` branch only after the destination is
publicly accessible and its cart has been verified. The source branch remains
`codex/current-spectre-site`. Publishing must preserve the live cart and availability.

For server packaging after `pnpm build`, run `python3 scripts/package-worker.py release.tar.gz`.
The archive contains the Worker, client assets and built deployment metadata, including
`dist/.openai/drizzle` migrations. It contains no credentials or local database state.

The inventory initialization route is administrative and disabled unless a temporary
`SPECTRE_SETUP_TOKEN` secret is configured. It can seed a completely new database once;
it cannot refill or reset existing inventory. Remove that temporary secret after setup.
Checkout requests are enquiries, not paid sales; confirmed manual sales still require
corresponding inventory management.

## Media

Website visuals and brand assets remain the property of their respective rights holders.
This repository does not grant a licence to reuse the photography, artwork or logo.
