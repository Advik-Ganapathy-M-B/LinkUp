# LinkUp

A live networking companion for events. Attendees can discover people who are checked in, share profile details, connect, and choose a spot on the room map.

## Features

- **Attendee discovery:** Browse people checked in to the event; search names, interests, and profile details; filter by interest or mutual connections.
- **Attendee profiles:** View and edit profile details such as role, education, fun facts, interests, networking goals, and an optional LinkedIn URL or photo URL.
- **Conversation starters:** Open another attendee's profile to see up to three suggested openers based on shared interests, overlapping networking-goal terms, or shared background details. Each suggestion explains why it may be relevant. If no overlap is found, suggestions use details the attendee chose to share.
- **Connection requests:** Send a request; the recipient can accept or decline it. Accepted connections appear for both attendees.
- **Check-in and room map:** Check in or out and choose a spot on the event's room map. The pin is manually placed; LinkUp does not use GPS.
- **Sign-in:** Supabase Auth provides email/password accounts. FastAPI protects attendee and connection APIs using the signed-in user's access token.

## Why I Built This

I deliberately chose to build a web application in a domain I had little to no prior experience in, particularly HTML, CSS, and JavaScript. The idea was to step outside my existing technical comfort zone and explore how effectively I could use AI coding agents such as Codex to learn unfamiliar technologies and turn an idea into a working product.

I approached LinkUp as a hands-on, learn-as-we-build experiment. Rather than treating AI-generated code as a black box, I used the project to ask questions, understand implementations, troubleshoot errors, and gradually learn how the different components of an application fit together.

What began as a fun side project became an opportunity to explore how clear instructions, relevant context, and iterative feedback can make software development more effective while keeping me involved in the decisions.

## Learning Outcomes

- **Prompt Engineering:** Writing clear prompts, providing relevant context, sharing errors and screenshots, and refining requests based on application behaviour.
- **AI-Assisted Debugging:** Using coding agents to identify errors, investigate possible solutions, and iterate on implementations.
- **Understanding Application Architecture:** Learning how a website's frontend, backend API, authentication, and database interact.
- **End-to-End Development:** Experiencing the process of taking an idea from initial implementation and local execution to deployment, including the limitations and trade-offs of free hosting.

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

1. In the Supabase dashboard, create a project, enable Email authentication, and find its Project URL and publishable key in the API settings.
2. Copy `.env.example` to `.env` in the project root.
3. Fill in the four variables in `.env`:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_with_your_project_key
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_with_your_project_key
   ```

   Use your project URL and publishable key in both pairs. The `VITE_` variables are embedded in the frontend at build time; the unprefixed variables are read by Python. A publishable key is intended for browser use. Never put a Supabase secret or service-role key in a `VITE_` variable or frontend code.
4. In Supabase **Authentication > URL Configuration**, add `http://localhost:5173` to the allowed redirect URLs. For deployment, also add the Render URL and set the Site URL to the URL you want Supabase confirmation links to return to.
5. If email confirmation is enabled, configure Supabase SMTP for reliable confirmation emails before inviting real users.

`.env` is ignored by Git. Do not commit it or share its contents.

## Run locally

From the project root, install the frontend dependencies:

```powershell
npm install
```

In one PowerShell window, create and activate a Python environment, install the backend dependencies, and start FastAPI:

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

The first API run creates `linkup.sqlite3` and adds fictional sample attendees. The database is local and ignored by Git. LinkUp creates an attendee profile for a new Supabase account after that account makes its first authenticated API request.

## Tests

Run the built-in Node.js tests from the project root:

```powershell
npm test
```

The tests cover case-insensitive shared-interest suggestions, profiles with different interests, shared networking goals and background details, and profiles without enough information to suggest an opener. They use Node's built-in test runner and add no testing dependency.

## Build and serve the frontend with FastAPI

```powershell
npm run build
fastapi run backend/main.py
```

FastAPI serves the generated `dist` website and its API from one origin. Set the same environment variables on the hosting service. The `VITE_` variables are embedded into the frontend at build time, so provide them before `npm run build`.

## Deploy a free public demo on Render

The deployed demo runs as a Render Docker web service. Render gives the app a stable `onrender.com` URL. Free services sleep after 15 minutes without requests and may take about a minute to wake up. The free filesystem is temporary, so fictional attendee/profile/connection data can reset when the service sleeps or restarts. This setup is for a demo, not real attendee data.

1. Push the repository to GitHub and confirm `.env` is ignored and not committed.
2. In Render, choose **New > Web Service** and connect the repository and branch you want to deploy.
3. Choose **Docker** as the runtime, keep the root directory blank, select the **Free** plan, and do not attach a disk. The Dockerfile builds the frontend and starts FastAPI; no separate build or start command is needed.
4. Add `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` in Render's environment variables. Use your project URL and publishable key for each pair. Do not use a Supabase secret or service-role key.
5. Create the service. When deployment finishes, Render displays its public URL.
6. In Supabase **Authentication > URL Configuration**, add the Render URL to the allowed redirect URLs. Keep `http://localhost:5173` there for local development.

`render.yaml` contains the same free-service configuration for creating a Render Blueprint instead. Do not create a second service if the web service already exists. Do not switch to a paid plan or add paid storage. Use fictional attendee data because Render's free service can sleep and its local SQLite data can reset.

## Deployment architecture

For a public demo, the free Render service serves the built frontend and FastAPI from one stable URL. Its SQLite database is temporary and intended only for fictional demo data.

For a real event or multiple API instances, keep Supabase Auth and move attendee, event, and connection records from SQLite to Supabase Postgres. Use per-event authorization and Row Level Security or equivalent server-side checks so attendees can only access profiles and connections allowed for their event. Keep FastAPI responsible for verifying identity and enforcing LinkUp rules. Store the SQLite file on persistent storage only for a single-instance demo.

## Current backend scope

- Attendee profile details, sample connections, check-in state, and room-map pins are stored in SQLite.
- Profile edits, connections, check-in/out, and map pins persist after refreshing the page.
- Connections use requests: the recipient can accept or decline, and both attendees become connected after acceptance.
- Conversation starters are generated in the frontend from existing profile fields; no conversation-starter API or external AI service is used.
- The map displays checked-in attendees who have shared a pin.
- Sample attendee cards are examples; use two signed-in test accounts to exercise sending and accepting a request end to end.
- The page refreshes event data every five seconds while visible, and avoids overlapping refreshes.
- Protected API endpoints require a valid Supabase access token. `/api/health` remains public for hosting health checks.
