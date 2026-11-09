# Life Simulation v3 Frontend

Next.js canvas viewer for the Life Simulation v3 project. The [backend repository](https://github.com/blind675/world-sim-3-server) owns the world, simulation, and shared project documentation: [overview](https://github.com/blind675/world-sim-3-server/blob/main/docs/PROJECT_OVERVIEW.md), [PRD](https://github.com/blind675/world-sim-3-server/blob/main/docs/PRODUCT_REQUIREMENTS.md), and [build checklist](https://github.com/blind675/world-sim-3-server/blob/main/docs/BUILD_CHECKLIST.md).

Routine work is committed to `staging`; `main` is reserved for an explicitly requested production release. See the backend's [release workflow](https://github.com/blind675/world-sim-3-server/blob/staging/docs/RELEASE_WORKFLOW.md). Keep Netlify's production branch on `main`, and disable staging branch deploys or previews in Netlify settings if they consume unwanted build minutes.

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
The public viewer does not send simulation control requests. Production controls must never embed a backend control token in `NEXT_PUBLIC_*` variables.

Open `/admin/world` to start a fresh simulation when all agents have died. It shows the current tick, living agents, and deaths, then requires a separate admin password and the phrase `RESET WORLD`. The browser sends the password only to this site's Next.js API route. The route checks it server-side and forwards the reset to Railway with the backend's bearer token. Set `WORLD_ADMIN_PASSWORD` to a strong, separate password and `CONTROL_API_TOKEN` to the existing Railway token in **Netlify server-side environment variables**. Neither belongs in `NEXT_PUBLIC_*` or the repository. Deploy the backend update first; the reset button needs its new `worldId` status field. If either Netlify secret is missing, the action fails closed. A reset replaces both durable snapshots and cannot be undone through the page; back up the Railway volume first if the old world matters. Ordinary map viewing remains public and read-only.

The map loads object names, colours, and sprite keys from the backend's read-only `GET /api/object-definitions` catalogue. Curated SVG sprites live in `public/objects/`; simple canvas shapes remain as a fallback. Open `/admin/objects` to browse definitions with category and text filters, or switch to the Add object tab to create or edit a variety. The page scrolls independently of the map viewer. Import, export, and reset work on a browser-local draft, never on the running world. Publishing a draft requires review and a backend deployment; the world snapshot pins the catalogue hash, so incompatible changes need a planned migration or a new world. The editor deliberately has no public production write action or browser admin token.

Agent movement follows the server's path and tick timing between viewport updates. The viewer polls visible agents every 2–5 seconds, corrects from fresh server state, and holds at the end of a predicted route or after several ticks without an update. The backend should be deployed before this frontend so its timing fields and agent type are available. On Node.js 22.18 or newer, run the movement tests with `node --test test/*.test.mjs`.
