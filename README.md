# BioSecure Farm

and poultry farm intelligence platform for animal health, biosecurity, disease alerts, farm locations, veterinary services, and compliance.

## Run locally

Requirements: Node.js 20 or newer. Docker Desktop is used to start MongoDB when no local MongoDB service is already running.

After cloning or pulling the repository, install dependencies once:

```powershell
npm ci
```

Then start the local stack:

```powershell
npm start
```

On Windows, `start.bat` runs the same command. The launcher starts MongoDB through Docker Compose only when port 27017 is not already in use, then starts the Express API and Vite. It does not seed, reset, or overwrite database data.

Open the app at http://localhost:5173/. The API health check is http://localhost:5000/api/health. Press Ctrl+C in the startup terminal to stop the API and Vite processes it started. The MongoDB Docker container and its data volume remain available for the next run.

To open the app from another device on the same Wi-Fi, use the host computer's LAN IP, for example `http://192.168.1.20:5173/`. Allow inbound TCP ports 5173 and 5000 through the host computer's private-network firewall. The frontend automatically uses that same LAN hostname for the API.

GitHub push/pull only synchronizes source files; it does not run the app. After pulling, run `npm start` (after the one-time `npm ci`) on the computer that should host the local app. No cloud deployment or GitHub Actions are configured.

## Local configuration

Copy `.env.example` to `.env.local` and add your OpenWeather API key. Leave `VITE_API_BASE_URL` unset for same-host and LAN access. The API accepts `MONGO_URI`, `DB_NAME`, and `PORT`; defaults are `mongodb://127.0.0.1:27017`, `biosecure_db`, and `5000`.

## Build

```powershell
npm run build
```

## Government administration portal

The Government Officer **Dashboard** is the public-services administration workspace: overview analytics, complaint review and assignment, scheme management and application decisions, and department/officer administration. It uses the existing signed-in API session and separate MongoDB collections (`government_citizens`, `government_complaints`, `government_schemes`, `government_scheme_applications`, `government_departments`). It does not repurpose livestock disease reports as citizen complaints.

Start the local app with `npm start`. If a pre-existing API process is using port 5000, the launcher checks for the government administration endpoint and reports when that process must be restarted. Authenticated endpoints are under `/api/government/admin/` for dashboard metrics, complaints, schemes/applications, departments/officers, and alerts. Complaint lists support search, department, district, priority, status, date, sorting, and pagination. Officer activation and government-officer creation are enforced by server-side role checks; passwords are bcrypt-hashed.

For local development only, synthetic records may be added explicitly:

```powershell
node scripts/seed-government-demo.js --confirm
```

The seeder refuses remote MongoDB hosts and production mode, uses deterministic `*-DEMO-*` identifiers, marks all seed documents `isSynthetic`, and never overwrites existing records. The Development demo data toggle queries only synthetic records; production disables this mode. Seeded citizen identities are fictional references only. Do not use the demo dataset as real statistics.
