# Demo deploy to Vercel

This project is a Next.js PWA for the Ultra Svet B2B catalog. The demo build is ready for Vercel with local JSON data bundled into the deployment.

## 1. Preflight locally

```bash
npm install
npm run build
```

Expected result:

- `next build` finishes successfully.
- `public/sw.js` is generated during the production build.
- PWA is disabled in development and enabled only for production builds.
- `npm run dev` removes generated service-worker files before starting dev mode.

## 2. Environment variables

Add these variables in Vercel Project Settings -> Environment Variables:

```env
ADMIN_LOGIN=admin
ADMIN_PASSWORD=1234
```

For a public demo, change `ADMIN_PASSWORD` to a stronger value before sharing the link.

Local development creates `.env.local` automatically through:

```bash
npm run ensure:env
```

The example file is `.env.local.example`.

## 3. Vercel project settings

Use the default Next.js settings:

- Framework Preset: `Next.js`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: leave empty
- Node.js Runtime: default Vercel Node.js runtime

Do not run parser/import scripts during deploy. The deploy uses the existing `products.json`.

## 4. Data storage note for demo

The product catalog is read from `products.json`.

Orders, clients and commercial proposals are stored in JSON files for the demo. On Vercel, serverless functions cannot rely on writing back to project files, so runtime writes are redirected to temporary storage seeded from:

- `data/orders.json`
- `data/clients.json`
- `data/proposals.json`

This is enough for demo checks, but it is not a production database. Before a real launch, move orders, clients and proposals to a persistent database or managed storage.

## 5. PWA checks

After deployment, open these URLs:

- `/manifest.json`
- `/sw.js`
- `/~offline`
- `/catalog`
- `/categories`

Expected behavior:

- Manifest returns valid JSON and includes icons.
- Service worker exists only after production build.
- Development mode logs `PWA support is disabled`.
- Catalog and category tree load without requesting the full product database on the client.

## 6. Demo smoke test

Check these flows:

1. Open `/catalog` and search by article fragment.
2. Open `/categories` and expand the category tree.
3. Add a product to cart and open `/cart`.
4. Log in as manager at `/admin/login`.
5. Open `/admin/orders`, `/admin/clients`, `/admin/offers`.
6. Create or edit a client and verify client prices in the catalog.
7. Send a test order and confirm it appears in manager orders.

## 7. Files intentionally excluded from deploy upload

`.vercelignore` excludes local-only files:

- `node_modules`
- `.next`
- local logs
- local env files
- Codex/debug artifacts

Do not exclude `products.json` or `data/*.json`; they are required for the demo.
