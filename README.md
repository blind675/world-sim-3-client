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

For Netlify, set `NEXT_PUBLIC_BACKEND_URL` to the backend's HTTPS URL (for example, `https://world-sim-3-server-production.up.railway.app`) and rebuild the site. A bare hostname is also accepted; the client adds `https://` automatically.

## Checks

```bash
npm run lint
npm run build
```

The backend serves live simulation data. This repository renders and inspects it; see `src/lib/api.ts` for API calls. On a phone, swipe the map to pan, pinch or use the zoom buttons, and open **Layers & details** for display settings and agent details. **Find agent** opens a searchable list of living agents; selecting one centers and highlights it. Turn on **Follow agent** in its details to keep the camera centered as it moves. Panning turns follow off. Desktop retains the sidebar. PWA installation is future work.
The public viewer does not send simulation control requests. Production controls require a server-side sign-in flow and must never embed a backend control token in `NEXT_PUBLIC_*` variables.

Agent movement follows the server's path and tick timing between viewport updates. The viewer polls visible agents every 2–5 seconds, corrects from fresh server state, and holds at the end of a predicted route or after several ticks without an update. The backend should be deployed before this frontend so its timing fields and agent type are available. On Node.js 22.18 or newer, run the movement tests with `node --test test/*.test.mjs`.
