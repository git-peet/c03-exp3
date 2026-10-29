# EverShop end-to-end tests

Internal Playwright suite for core maintainers. Not bundled with the published `@evershop/evershop` package.

## Scope

- **`pageBuilder/`** — page-builder editor flows (drag/drop, drawer, share, publish, rollouts, ...).
- **`admin/`** — future home for non-page-builder admin UI tests (products, orders, customers, ...).
- **`storefront/`** — future home for storefront-side tests (cart, checkout, product page, ...).
- **`shared/`** — cross-suite helpers: DB access, throw-away admin user, Playwright globalSetup/Teardown, BEM selectors.

Add new suites as siblings of `pageBuilder/`. The same fixtures + storage state are reusable.

## Prerequisites

1. **EverShop dev server is running** on `BASE_URL` (default `http://localhost:3000`). The suite does **not** start it for you — that's heavyweight and the user controls it.
   ```bash
   # in the repo root
   npm run dev
   ```
2. **Postgres is reachable** on `DATABASE_URL` (default `postgres://root@localhost:5432/evershop`). Same DB the dev server uses.
3. **Playwright browsers installed**:
   ```bash
   cd core/tests/e2e
   npm install
   npx playwright install chromium
   ```

## Running

```bash
cd core/tests/e2e
cp .env.example .env   # edit if your dev server / DB differ from defaults
npm test               # whole suite, headless
npm run test:ui        # interactive Playwright UI mode
npm run test:headed    # see the browser
npm run test:debug     # step through with the Playwright inspector
npm run test:pb        # page-builder specs only
npm run test:report    # open last run's HTML report
```

## How auth works

`globalSetup`:
1. Sweeps any orphaned `e2e-%` admin users / changesets / widgets from previous runs.
2. Creates a throw-away admin (`e2e-<uuid>@evershop-e2e.invalid`, random 64-hex-char password).
3. Logs in via the real `/admin/user/login` endpoint and saves the resulting session cookie to `.auth/admin.json`.
4. Records the admin's DB id in `.auth/admin.meta.json` so teardown can target it.

Specs use the saved storage state automatically — they start already logged in. Plaintext password is never persisted to disk; it lives only in `globalSetup`'s memory and gets hashed for the DB row.

`globalTeardown`:
1. Deletes the test admin (cascade-deletes their changesets).
2. Drops any leftover `e2e-%` widgets / changesets.
3. Wipes `.auth/` so the next run starts clean.
4. Closes the pg pool.

If a run is killed (Ctrl-C, crash), orphans get cleaned up on the next `globalSetup`.

## Wishlist UI tests (isolated runner)

Wishlist persistence tests must not use this suite's standard configuration: the standard suite reads `DATABASE_URL` and shares the dev-server database.

The wishlist UI specs use a separate configuration with no `.env` loading, no global setup/teardown, and no database helper. Run them only against an app server backed by a dedicated disposable test database:

```bash
WISHLIST_UI_TEST_DISPOSABLE_DATABASE=true \
WISHLIST_UI_TEST_BASE_URL=http://127.0.0.1:3000 \
WISHLIST_UI_TEST_EMAIL=... \
WISHLIST_UI_TEST_PASSWORD=... \
WISHLIST_UI_TEST_PRODUCT_UUID=... \
WISHLIST_UI_TEST_PRODUCT_URL=/product/... \
npm run test:e2e:wishlist
```

The runner requires every variable, accepts only loopback app URLs, validates that the product URL is same-origin, and has no dev-server/database fallback. The `DISPOSABLE_DATABASE` flag is an operator assertion: only set it after verifying the app itself is connected to a disposable database. The runner cannot inspect or guarantee the server's database configuration.

For service/API persistence tests, use the separate root command `npm run test:wishlist:integration`. It requires a locally available `postgres:16-alpine` Docker image, starts a fresh container with an ephemeral port and no mounted data volume, uses no `DATABASE_URL` or `.env`, and removes the container on completion. It uses `--pull=never`; a missing image fails rather than triggering a network pull or falling back to another database.

## Conventions

- **Test data naming**: anything the suite inserts is prefixed `e2e-` in its `name` field. Cleanup is a single `DELETE WHERE name LIKE 'e2e-%'`. Tests that violate this convention won't be cleaned up — that's intentional, makes the contract loud.
- **Selectors**: use the BEM classes in `shared/selectors.ts` for storefront output, `role` + accessible-name for editor chrome. Never inline raw class strings — they break on Tailwind refactors.
- **Iframe**: the editor's preview is in an iframe. Always go through `EditorPage.previewFrame()` for storefront-side assertions.
- **Assertions**: prefer Playwright's auto-retrying `expect(locator).toBeVisible()` etc. over `waitForTimeout`. Sleeps are a smell.
- **DB-level checks**: for ops that should persist, also query the DB directly via `getDb()` — UI green + DB silent is a worse failure mode than UI red.

## Folder structure

```
core/tests/e2e/
├── README.md                 (this file)
├── package.json
├── playwright.config.ts
├── tsconfig.json
├── .env.example
├── .gitignore
├── shared/
│   ├── auth.ts               throw-away admin user
│   ├── db.ts                 pg pool + cleanup helpers
│   ├── globalSetup.ts        runs before all specs
│   ├── globalTeardown.ts     runs after all specs
│   └── selectors.ts          BEM + role-based locators
├── pageBuilder/
│   ├── pages/                page-object models (Editor, Drawer, ...)
│   ├── seeds/                per-test widget / changeset factories
│   └── specs/
│       ├── 01-rendering/
│       ├── 02-session-picker/
│       ├── 03-drag-drop/
│       ├── 04-widget-actions/
│       ├── 05-settings/
│       ├── 06-publish/
│       ├── 07-rollout/
│       ├── 08-link-resolution/
│       └── 09-undo-redo/
├── admin/                    (placeholder for future suite)
└── storefront/               (placeholder for future suite)
```
