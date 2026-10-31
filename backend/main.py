"""The LinkUp demo API and SQLite database."""

import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from supabase import create_client
from starlette.staticfiles import StaticFiles


PROJECT_ROOT = Path(__file__).resolve().parent.parent
LEGACY_DEMO_USER_ID = "you"
load_dotenv(PROJECT_ROOT / ".env")
DATABASE_PATH = Path(
    os.getenv("LINKUP_DATABASE_PATH", str(PROJECT_ROOT / "linkup.sqlite3"))
)
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
supabase_auth = (
    create_client(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    if SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY
    else None
)
bearer_scheme = HTTPBearer(auto_error=False)

app = FastAPI(title="LinkUp API")

FRONTEND_DIST = PROJECT_ROOT / "dist"
if (FRONTEND_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


@contextmanager
def database() -> Iterator[sqlite3.Connection]:
    """Open a database connection and always close it after a request."""
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database() -> None:
    """Create the tables and add fictional sample attendees on first run."""
    with database() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS attendees (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                note TEXT NOT NULL,
                interests TEXT NOT NULL,
                color TEXT NOT NULL,
                education TEXT NOT NULL DEFAULT '',
                fun_fact TEXT NOT NULL DEFAULT '',
                looking_to_meet TEXT NOT NULL DEFAULT '',
                linkedin TEXT NOT NULL DEFAULT '',
                photo TEXT NOT NULL DEFAULT '',
                checked_in INTEGER NOT NULL DEFAULT 1,
                map_x REAL,
                map_y REAL,
                auth_user_id TEXT
            );
            CREATE TABLE IF NOT EXISTS connections (
                user_id TEXT NOT NULL REFERENCES attendees(id),
                attendee_id TEXT NOT NULL REFERENCES attendees(id),
                PRIMARY KEY (user_id, attendee_id),
                CHECK (user_id <> attendee_id)
            );
            CREATE TABLE IF NOT EXISTS connection_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id TEXT NOT NULL REFERENCES attendees(id),
                recipient_id TEXT NOT NULL REFERENCES attendees(id),
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status = 'pending'),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (sender_id, recipient_id),
                CHECK (sender_id <> recipient_id)
            );
            CREATE INDEX IF NOT EXISTS connection_requests_recipient_status
            ON connection_requests(recipient_id, status);
            """
        )

        # Connections made before request/accept existed count as accepted.
        connection.execute(
            """INSERT OR IGNORE INTO connections (user_id, attendee_id)
            SELECT attendee_id, user_id FROM connections"""
        )

        # Existing local SQLite databases were created before Supabase auth.
        attendee_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(attendees)")
        }
        if "auth_user_id" not in attendee_columns:
            connection.execute("ALTER TABLE attendees ADD COLUMN auth_user_id TEXT")
        connection.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS attendees_auth_user_id "
            "ON attendees(auth_user_id) WHERE auth_user_id IS NOT NULL"
        )

        attendee_count = connection.execute("SELECT COUNT(*) FROM attendees").fetchone()[0]
        if attendee_count:
            return

        sample_attendees = [
            ("maya", "Maya Chen", "UX designer · 2nd year", "Always up for swapping ideas about making things easier to use.", ["Design", "Startups"], "peach", "Human-centred design, 2nd year", "I can fold a fitted sheet neatly on the first try.", "People building thoughtful products and accessible experiences.", "", "", 1, 28, 55),
            ("arjun", "Arjun Rao", "CS student · 3rd year", "Building a tiny app to help people find pickup games on campus.", ["Coding", "Startups"], "blue", "Computer science, 3rd year", "I once built a PC from parts I found in a campus swap group.", "People who enjoy turning small ideas into useful apps.", "", "", 1, 50, 68),
            ("zara", "Zara Patel", "Film society · 2nd year", "Looking for people to make a short film with this semester.", ["Film", "Creative"], "lilac", "Media studies, 2nd year", "I keep a list of interesting opening scenes from movies.", "Writers, actors, and anyone curious about making short films.", "", "", 1, None, None),
            ("leo", "Leo Martin", "Product intern · 4th year", "Happy to chat about getting your first internship in tech.", ["Startups", "Career"], "yellow", "Business and information systems, 4th year", "I collect maps from cities I have visited.", "Students exploring product roles or preparing for internships.", "", "", 1, None, None),
            ("nina", "Nina Okafor", "Illustrator · 1st year", "Sketchbook is always open. Currently learning motion design.", ["Design", "Creative"], "rose", "Visual communication, 1st year", "I draw a tiny character in the corner of every notebook.", "Artists who want to share work and learn motion design together.", "", "", 1, 74, 51),
            ("dev", "Dev Shah", "Robotics club · 3rd year", "Prototyping a low-cost robot arm and looking for collaborators.", ["Coding", "Robotics"], "mint", "Mechatronics, 3rd year", "My first robot was made from cardboard and an old toy motor.", "People into robotics, prototyping, or learning by building.", "", "", 1, None, None),
            ("you", "Advik Ganapathy", "AI/ML Enthusiast · 1st year", "Prototyping a walking spider robot", ["Coding", "Music"], "peach", "", "", "", "", "", 1, None, None),
        ]
        connection.executemany(
            """INSERT INTO attendees
            (id, name, role, note, interests, color, education, fun_fact,
             looking_to_meet, linkedin, photo, checked_in, map_x, map_y)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [(*attendee[:4], json.dumps(attendee[4]), *attendee[5:]) for attendee in sample_attendees],
        )

        sample_connections = [
            ("maya", "arjun"), ("maya", "nina"), ("maya", "leo"),
            ("arjun", "maya"), ("arjun", "dev"),
            ("zara", "nina"),
            ("leo", "maya"), ("leo", "dev"),
            ("nina", "maya"), ("nina", "zara"),
            ("dev", "arjun"), ("dev", "leo"),
        ]
        connection.executemany(
            "INSERT INTO connections (user_id, attendee_id) VALUES (?, ?)",
            sample_connections,
        )


def attendee_to_dict(
    connection: sqlite3.Connection,
    row: sqlite3.Row,
    connection_ids: list[str] | None = None,
) -> dict:
    if connection_ids is None:
        connection_ids = [
            item["attendee_id"]
            for item in connection.execute(
                "SELECT attendee_id FROM connections WHERE user_id = ? ORDER BY attendee_id",
                (row["id"],),
            ).fetchall()
        ]
    location = None
    if row["map_x"] is not None and row["map_y"] is not None:
        location = {"x": row["map_x"], "y": row["map_y"]}

    return {
        "id": row["id"],
        "name": row["name"],
        "role": row["role"],
        "note": row["note"],
        "interests": json.loads(row["interests"]),
        "connections": connection_ids,
        "color": row["color"],
        "education": row["education"],
        "funFact": row["fun_fact"],
        "lookingToMeet": row["looking_to_meet"],
        "linkedin": row["linkedin"],
        "photo": row["photo"],
        "checkedIn": bool(row["checked_in"]),
        "location": location,
        "canReceiveRequests": bool(row["auth_user_id"]),
    }


def attendees_to_dict(connection: sqlite3.Connection, rows: list[sqlite3.Row]) -> list[dict]:
    """Serialize the directory with one connection query instead of one per person."""
    links = connection.execute(
        "SELECT user_id, attendee_id FROM connections ORDER BY attendee_id"
    ).fetchall()
    connection_map: dict[str, list[str]] = {}
    for link in links:
        connection_map.setdefault(link["user_id"], []).append(link["attendee_id"])
    return [
        attendee_to_dict(connection, row, connection_map.get(row["id"], []))
        for row in rows
    ]


def find_attendee(connection: sqlite3.Connection, attendee_id: str) -> dict:
    row = connection.execute("SELECT * FROM attendees WHERE id = ?", (attendee_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Attendee not found")
    return attendee_to_dict(connection, row)


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    role: str = Field(max_length=100)
    education: str = Field(max_length=120)
    funFact: str = Field(max_length=240)
    lookingToMeet: str = Field(max_length=240)
    linkedin: str = Field(max_length=300)
    photo: str = Field(max_length=1000)


class LocationUpdate(BaseModel):
    x: float = Field(ge=4, le=96)
    y: float = Field(ge=22, le=91)


initialize_database()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """Validate the Supabase access token and return its trusted user identity."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    if supabase_auth is None:
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.",
        )
    try:
        # get_claims verifies the JWT signature against cached Supabase public keys.
        # Unlike get_user, it usually avoids a network call for every API request.
        response = supabase_auth.auth.get_claims(credentials.credentials)
        claims = getattr(response, "claims", None)
        if claims is None and isinstance(response, dict):
            claims = response.get("claims")
    except Exception as error:
        raise HTTPException(status_code=401, detail="Your session is invalid or expired") from error
    expected_issuer = f"{SUPABASE_URL}/auth/v1"
    audience = claims.get("aud") if isinstance(claims, dict) else None
    valid_audience = audience == "authenticated" or (
        isinstance(audience, list) and "authenticated" in audience
    )
    user_id = claims.get("sub") if isinstance(claims, dict) else None
    if (
        not user_id
        or claims.get("iss") != expected_issuer
        or not valid_audience
    ):
        raise HTTPException(status_code=401, detail="Your session is invalid or expired")
    return {"id": str(user_id), "email": claims.get("email") or ""}


def ensure_user_profile(connection: sqlite3.Connection, user: dict) -> dict:
    """Create a LinkUp profile on the first authenticated visit."""
    user_id = user["id"]
    row = connection.execute(
        "SELECT * FROM attendees WHERE auth_user_id = ?", (user_id,)
    ).fetchone()
    if row is None:
        connection.execute(
            """INSERT INTO attendees
            (id, auth_user_id, name, role, note, interests, color, checked_in)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)""",
            (user_id, user_id, user["email"].split("@")[0] or "New attendee",
             "New attendee", "Add a little about yourself.", "[]", "blue"),
        )
        row = connection.execute(
            "SELECT * FROM attendees WHERE auth_user_id = ?", (user_id,)
        ).fetchone()
    return attendee_to_dict(connection, row)


def send_connection_request(
    connection: sqlite3.Connection,
    sender_id: str,
    recipient_id: str,
) -> dict:
    if sender_id == recipient_id:
        raise HTTPException(status_code=400, detail="You cannot connect to yourself")
    find_attendee(connection, recipient_id)
    recipient_account = connection.execute(
        "SELECT auth_user_id FROM attendees WHERE id = ?", (recipient_id,)
    ).fetchone()
    if not recipient_account["auth_user_id"]:
        raise HTTPException(
            status_code=409,
            detail="This sample profile cannot accept requests. Try another signed-in attendee.",
        )

    already_connected = connection.execute(
        """SELECT 1 FROM connections
        WHERE (user_id = ? AND attendee_id = ?)
           OR (user_id = ? AND attendee_id = ?) LIMIT 1""",
        (sender_id, recipient_id, recipient_id, sender_id),
    ).fetchone()
    if already_connected:
        connection.executemany(
            "INSERT OR IGNORE INTO connections (user_id, attendee_id) VALUES (?, ?)",
            [(sender_id, recipient_id), (recipient_id, sender_id)],
        )
        return {"status": "connected"}

    incoming = connection.execute(
        """SELECT 1 FROM connection_requests
        WHERE sender_id = ? AND recipient_id = ? AND status = 'pending'""",
        (recipient_id, sender_id),
    ).fetchone()
    if incoming:
        connection.executemany(
            "INSERT OR IGNORE INTO connections (user_id, attendee_id) VALUES (?, ?)",
            [(sender_id, recipient_id), (recipient_id, sender_id)],
        )
        connection.execute(
            """DELETE FROM connection_requests
            WHERE (sender_id = ? AND recipient_id = ?)
               OR (sender_id = ? AND recipient_id = ?)""",
            (sender_id, recipient_id, recipient_id, sender_id),
        )
        return {"status": "connected"}

    connection.execute(
        """INSERT OR IGNORE INTO connection_requests (sender_id, recipient_id)
        VALUES (?, ?)""",
        (sender_id, recipient_id),
    )
    return {"status": "pending"}


@app.get("/", include_in_schema=False)
def home():
    built_page = FRONTEND_DIST / "index.html"
    if not built_page.is_file():
        raise HTTPException(status_code=503, detail="Build the frontend with npm run build first")
    return FileResponse(built_page)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/bootstrap")
def bootstrap(user: dict = Depends(get_current_user)):
    """Fetch the event directory and the signed-in user's profile in one request."""
    with database() as connection:
        current_profile = ensure_user_profile(connection, user)
        rows = connection.execute(
            "SELECT * FROM attendees WHERE id <> ? ORDER BY name", (LEGACY_DEMO_USER_ID,)
        ).fetchall()
        attendees = attendees_to_dict(connection, rows)
        pending_requests = connection.execute(
            """SELECT sender_id, recipient_id FROM connection_requests
            WHERE status = 'pending' AND (sender_id = ? OR recipient_id = ?)""",
            (current_profile["id"], current_profile["id"]),
        ).fetchall()
        requests = {
            "incoming": [row["sender_id"] for row in pending_requests
                         if row["recipient_id"] == current_profile["id"]],
            "outgoing": [row["recipient_id"] for row in pending_requests
                         if row["sender_id"] == current_profile["id"]],
        }
        return {"attendees": attendees, "me": current_profile, "requests": requests}


@app.get("/api/attendees")
def list_attendees(user: dict = Depends(get_current_user)):
    """Keep the original attendee-directory endpoint for existing API clients."""
    with database() as connection:
        ensure_user_profile(connection, user)
        rows = connection.execute(
            "SELECT * FROM attendees WHERE id <> ? ORDER BY name", (LEGACY_DEMO_USER_ID,)
        ).fetchall()
        return attendees_to_dict(connection, rows)


@app.get("/api/me")
def current_profile(user: dict = Depends(get_current_user)):
    with database() as connection:
        return ensure_user_profile(connection, user)


@app.put("/api/me")
def update_current_profile(profile: ProfileUpdate, user: dict = Depends(get_current_user)):
    fields = profile.model_dump()
    with database() as connection:
        current_profile = ensure_user_profile(connection, user)
        connection.execute(
            """UPDATE attendees
            SET name = ?, role = ?, education = ?, fun_fact = ?,
                looking_to_meet = ?, linkedin = ?, photo = ?
            WHERE id = ?""",
            (fields["name"], fields["role"], fields["education"], fields["funFact"],
             fields["lookingToMeet"], fields["linkedin"], fields["photo"], current_profile["id"]),
        )
        return find_attendee(connection, current_profile["id"])


@app.put("/api/connections/{attendee_id}")
def connect_to_attendee(attendee_id: str, user: dict = Depends(get_current_user)):
    with database() as connection:
        current_profile = ensure_user_profile(connection, user)
        return send_connection_request(connection, current_profile["id"], attendee_id)


@app.post("/api/connection-requests/{attendee_id}")
def request_connection(attendee_id: str, user: dict = Depends(get_current_user)):
    with database() as connection:
        current_profile = ensure_user_profile(connection, user)
        return send_connection_request(connection, current_profile["id"], attendee_id)


@app.post("/api/connection-requests/{attendee_id}/accept")
def accept_connection_request(attendee_id: str, user: dict = Depends(get_current_user)):
    with database() as connection:
        current_profile = ensure_user_profile(connection, user)
        find_attendee(connection, attendee_id)
        incoming_request = connection.execute(
            """SELECT 1 FROM connection_requests
            WHERE sender_id = ? AND recipient_id = ? AND status = 'pending'""",
            (attendee_id, current_profile["id"]),
        ).fetchone()
        if incoming_request is None:
            raise HTTPException(status_code=404, detail="Connection request not found")
        connection.executemany(
            "INSERT OR IGNORE INTO connections (user_id, attendee_id) VALUES (?, ?)",
            [(current_profile["id"], attendee_id), (attendee_id, current_profile["id"])],
        )
        connection.execute(
            """DELETE FROM connection_requests
            WHERE (sender_id = ? AND recipient_id = ?)
               OR (sender_id = ? AND recipient_id = ?)""",
            (attendee_id, current_profile["id"], current_profile["id"], attendee_id),
        )
        return {"status": "connected"}


@app.delete("/api/connection-requests/{attendee_id}")
def dismiss_connection_request(attendee_id: str, user: dict = Depends(get_current_user)):
    with database() as connection:
        current_profile = ensure_user_profile(connection, user)
        cursor = connection.execute(
            """DELETE FROM connection_requests
            WHERE status = 'pending' AND (
                (sender_id = ? AND recipient_id = ?)
                OR (sender_id = ? AND recipient_id = ?)
            )""",
            (current_profile["id"], attendee_id, attendee_id, current_profile["id"]),
        )
        return {"dismissed": cursor.rowcount > 0}


@app.delete("/api/connections/{attendee_id}")
def disconnect_from_attendee(attendee_id: str, user: dict = Depends(get_current_user)):
    with database() as connection:
        current_profile = ensure_user_profile(connection, user)
        connection.execute(
            """DELETE FROM connections
            WHERE (user_id = ? AND attendee_id = ?)
               OR (user_id = ? AND attendee_id = ?)""",
            (current_profile["id"], attendee_id, attendee_id, current_profile["id"]),
        )
        return {"connected": False}


@app.post("/api/check-in")
def check_in(user: dict = Depends(get_current_user)):
    with database() as connection:
        current_profile = ensure_user_profile(connection, user)
        connection.execute("UPDATE attendees SET checked_in = 1 WHERE id = ?", (current_profile["id"],))
        return find_attendee(connection, current_profile["id"])


@app.post("/api/check-out")
def check_out(user: dict = Depends(get_current_user)):
    with database() as connection:
        current_profile = ensure_user_profile(connection, user)
        connection.execute(
            "UPDATE attendees SET checked_in = 0, map_x = NULL, map_y = NULL WHERE id = ?",
            (current_profile["id"],),
        )
        return find_attendee(connection, current_profile["id"])


@app.put("/api/location")
def update_location(location: LocationUpdate, user: dict = Depends(get_current_user)):
    with database() as connection:
        current_profile = ensure_user_profile(connection, user)
        attendee = find_attendee(connection, current_profile["id"])
        if not attendee["checkedIn"]:
            raise HTTPException(status_code=409, detail="Check in before sharing your location")
        connection.execute(
            "UPDATE attendees SET map_x = ?, map_y = ? WHERE id = ?",
            (location.x, location.y, current_profile["id"]),
        )
        return find_attendee(connection, current_profile["id"])


@app.delete("/api/location")
def clear_location(user: dict = Depends(get_current_user)):
    with database() as connection:
        current_profile = ensure_user_profile(connection, user)
        connection.execute("UPDATE attendees SET map_x = NULL, map_y = NULL WHERE id = ?", (current_profile["id"],))
        return {"location": None}
