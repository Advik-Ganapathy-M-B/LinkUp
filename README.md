# LinkUp

A live networking companion for events.

## Objective
Help event attendees discover relevant people,
connect with them, and help organisers track attendance.

## Run locally

LinkUp uses a small Python API and an SQLite database. Install Python 3.10 or later, then run these commands from the project folder in PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
fastapi dev backend/main.py
```

Open <http://127.0.0.1:8000> in your browser. The API's interactive documentation is at <http://127.0.0.1:8000/docs>.

The first run creates `linkup.sqlite3` and fills it with fictional sample attendees. The database is local and ignored by Git. Do not open `index.html` directly; it needs to be served by the API so the page can request data.

## Current backend scope

- Attendee profiles, sample connection links, check-in state, and room-map pins are stored in SQLite.
- Profile edits, connections, check-in/out, and map pins persist after refreshing the page.
- The map displays checked-in sample attendees who have shared a pin.
- The page checks the API every five seconds for attendee, connection, check-in, and map changes.
- This is a single-user demo with a fixed demo identity and no sign-in. Add authentication and user-specific permissions before using it with real attendees or deploying it publicly.

## Later ideas

- Add sign-in and distinct attendee identities so multiple phones can update the shared event safely.
- Build recommendations and a dedicated My Connections page.
- Consider image uploads and improve profile privacy controls.
