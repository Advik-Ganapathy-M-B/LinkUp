# LinkUp

A live networking companion for events. Attendees can discover people who are checked in, share profile details, connect, and choose a spot on the room map.

## How sign-in works

- Supabase Auth handles email/password signup, email confirmation, login, and logout. LinkUp never saves or sends passwords to its own API.
- The Supabase browser client keeps the signed-in session and attaches its short-lived access token to each `/api` request.
- FastAPI verifies the token signature and trusted claims with Supabase's published signing keys, which are cached by the Supabase client. The verified Supabase user ID is linked to one SQLite attendee profile.
- Existing fictional attendees and connection records stay in SQLite. Existing local databases gain the `auth_user_id` column automatically the next time the API starts.

## Requirements

- Python 3.10 or newer
- Node.js 20.19+ (or 22.12+) and npm
- A Supabase project with Email auth enabled

## Configure Supabase

1. In the Supabase dashboard, create a project and find its Project URL and publishable key in the API settings.
2. Copy `.env.example` to `.env` in the project root.
3. Put the Project URL and publishable key in both sets of variables. The `VITE_` versions are used by the browser; the unprefixed versions are read by Python. The publishable key is intended for browser use. Never place a Supabase secret or service-role key in `.env` variables beginning with `VITE_` or in frontend code.
4. In Supabase Auth URL settings, set the Site URL to `http://localhost:5173` for local development and add that URL to the allowed redirect URLs. For a deployed site, set the production URL too.
5. Email confirmation may be enabled for signup. Configure Supabase SMTP for reliable confirmation emails before inviting real users.

`.env` is ignored by Git. Do not commit it or share its contents.

## Run locally

Install the frontend dependencies once:

```powershell
npm install
```

In one PowerShell window, set up and start FastAPI:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
fastapi dev backend/main.py
```

In a second PowerShell window, start Vite:

```powershell
npm run dev
```

Open <http://localhost:5173>. Vite serves the frontend and forwards `/api` requests to FastAPI at port 8000. API documentation is available at <http://127.0.0.1:8000/docs>.

The first API run creates `linkup.sqlite3` and adds fictional sample attendees. The database is local and ignored by Git. The attendee profile for a new Supabase account is created after the first authenticated API request.

## Build and serve the frontend with FastAPI

```powershell
npm run build
fastapi run backend/main.py
```

FastAPI serves the generated `dist` website and its API from one origin. Set the same environment variables on the hosting service. The `VITE_` variables are embedded into the frontend at build time, so provide them before `npm run build`.

## Deploy a free public demo on Render

The repository includes a Dockerfile and `render.yaml` for a free Render web service. Render gives the app a stable `onrender.com` URL. Free services sleep after 15 minutes without requests and may take about a minute to wake up. The free filesystem is temporary, so fictional attendee/profile/connection data can reset when the service sleeps or restarts. This setup is for a demo, not real attendee data.

1. Commit and push the project to GitHub. Confirm `.env` is ignored and not included in the commit.
2. In Render, choose **New > Blueprint** and connect this GitHub repository. Render reads `render.yaml` and shows the planned service.
3. Keep the service on the **Free** plan. Add the four Supabase variables Render requests: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. Use your project URL and publishable key; never use a Supabase secret or service-role key.
4. Create the Blueprint. When deployment finishes, Render displays the stable public URL.
5. In Supabase Auth URL settings, add the Render URL to the allowed redirect URLs. You can retain `http://localhost:5173` for local development.

Do not switch to a paid plan or add paid storage. Render's free service can sleep and its local SQLite data can reset, which is acceptable for fictional demo data.

## Deployment architecture

For a public demo, the free Render service serves the built frontend and FastAPI from one stable URL. Its SQLite database is temporary and intended only for fictional demo data.

For a real event or multiple API instances, keep Supabase Auth and move attendee, event, and connection records from SQLite to Supabase Postgres. Use per-event authorization and Row Level Security or equivalent server-side checks so attendees can only access profiles and connections allowed for their event. Keep FastAPI responsible for verifying identity and enforcing LinkUp rules. Store the SQLite file on persistent storage only for a single-instance demo.

## Current backend scope

- Attendee profile details, sample connections, check-in state, and room-map pins are stored in SQLite.
- Profile edits, connections, check-in/out, and map pins persist after refreshing the page.
- Connections use requests: the recipient can accept or decline, and both attendees become connected after acceptance.
- The map displays checked-in attendees who have shared a pin.
- Sample attendee cards are examples; use two signed-in test accounts to exercise sending and accepting a request end to end.
- The page refreshes event data every five seconds while visible, and avoids overlapping refreshes.
- Protected API endpoints require a valid Supabase access token. `/api/health` remains public for hosting health checks.
