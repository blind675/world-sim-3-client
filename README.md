# Life Simulation v3 Frontend

Next.js canvas viewer for the Life Simulation v3 project. The [backend repository](https://github.com/blind675/world-sim-3-server) owns the world, simulation, and shared project documentation: [overview](https://github.com/blind675/world-sim-3-server/blob/main/docs/PROJECT_OVERVIEW.md), [PRD](https://github.com/blind675/world-sim-3-server/blob/main/docs/PRODUCT_REQUIREMENTS.md), and [build checklist](https://github.com/blind675/world-sim-3-server/blob/main/docs/BUILD_CHECKLIST.md).

## Run locally

Start the backend, then run:

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open `http://localhost:3000`. The default backend URL is `http://localhost:4000`; set `NEXT_PUBLIC_BACKEND_URL` for another API origin. The deployed backend must allow the web app's origin through `CORS_ORIGIN`.

## Checks

```bash
npm run lint
npm run build
```

The backend serves live simulation data. This repository renders and inspects it; see `src/lib/api.ts` for API calls. Mobile layout and PWA installation are future work.
