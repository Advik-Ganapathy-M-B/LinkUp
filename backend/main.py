"""The LinkUp demo API and SQLite database."""

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATABASE_PATH = PROJECT_ROOT / "linkup.sqlite3"
CURRENT_USER_ID = "you"  # Demo identity; replace this with real sign-in later.

app = FastAPI(title="LinkUp API")


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
                map_y REAL
            );
            CREATE TABLE IF NOT EXISTS connections (
                user_id TEXT NOT NULL REFERENCES attendees(id),
                attendee_id TEXT NOT NULL REFERENCES attendees(id),
                PRIMARY KEY (user_id, attendee_id),
                CHECK (user_id <> attendee_id)
            );
            """
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


def attendee_to_dict(connection: sqlite3.Connection, row: sqlite3.Row) -> dict:
    connection_ids = connection.execute(
        "SELECT attendee_id FROM connections WHERE user_id = ? ORDER BY attendee_id",
        (row["id"],),
    ).fetchall()
    location = None
    if row["map_x"] is not None and row["map_y"] is not None:
        location = {"x": row["map_x"], "y": row["map_y"]}

    return {
        "id": row["id"],
        "name": row["name"],
        "role": row["role"],
        "note": row["note"],
        "interests": json.loads(row["interests"]),
        "connections": [item["attendee_id"] for item in connection_ids],
        "color": row["color"],
        "education": row["education"],
        "funFact": row["fun_fact"],
        "lookingToMeet": row["looking_to_meet"],
        "linkedin": row["linkedin"],
        "photo": row["photo"],
        "checkedIn": bool(row["checked_in"]),
        "location": location,
    }


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


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(PROJECT_ROOT / "index.html")


@app.get("/styles.css", include_in_schema=False)
def styles():
    return FileResponse(PROJECT_ROOT / "styles.css", media_type="text/css")


@app.get("/app.js", include_in_schema=False)
def javascript():
    return FileResponse(PROJECT_ROOT / "app.js", media_type="text/javascript")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/attendees")
def list_attendees():
    with database() as connection:
        rows = connection.execute("SELECT * FROM attendees ORDER BY name").fetchall()
        return [attendee_to_dict(connection, row) for row in rows]


@app.get("/api/me")
def current_user():
    with database() as connection:
        return find_attendee(connection, CURRENT_USER_ID)


@app.put("/api/me")
def update_current_profile(profile: ProfileUpdate):
    fields = profile.model_dump()
    with database() as connection:
        connection.execute(
            """UPDATE attendees
            SET name = ?, role = ?, education = ?, fun_fact = ?,
                looking_to_meet = ?, linkedin = ?, photo = ?
            WHERE id = ?""",
            (fields["name"], fields["role"], fields["education"], fields["funFact"],
             fields["lookingToMeet"], fields["linkedin"], fields["photo"], CURRENT_USER_ID),
        )
        return find_attendee(connection, CURRENT_USER_ID)


@app.put("/api/connections/{attendee_id}")
def connect_to_attendee(attendee_id: str):
    if attendee_id == CURRENT_USER_ID:
        raise HTTPException(status_code=400, detail="You cannot connect to yourself")
    with database() as connection:
        find_attendee(connection, attendee_id)
        connection.execute(
            "INSERT OR IGNORE INTO connections (user_id, attendee_id) VALUES (?, ?)",
            (CURRENT_USER_ID, attendee_id),
        )
        return {"connected": True}


@app.delete("/api/connections/{attendee_id}")
def disconnect_from_attendee(attendee_id: str):
    with database() as connection:
        connection.execute(
            "DELETE FROM connections WHERE user_id = ? AND attendee_id = ?",
            (CURRENT_USER_ID, attendee_id),
        )
        return {"connected": False}


@app.post("/api/check-in")
def check_in():
    with database() as connection:
        connection.execute("UPDATE attendees SET checked_in = 1 WHERE id = ?", (CURRENT_USER_ID,))
        return find_attendee(connection, CURRENT_USER_ID)


@app.post("/api/check-out")
def check_out():
    with database() as connection:
        connection.execute(
            "UPDATE attendees SET checked_in = 0, map_x = NULL, map_y = NULL WHERE id = ?",
            (CURRENT_USER_ID,),
        )
        return find_attendee(connection, CURRENT_USER_ID)


@app.put("/api/location")
def update_location(location: LocationUpdate):
    with database() as connection:
        attendee = find_attendee(connection, CURRENT_USER_ID)
        if not attendee["checkedIn"]:
            raise HTTPException(status_code=409, detail="Check in before sharing your location")
        connection.execute(
            "UPDATE attendees SET map_x = ?, map_y = ? WHERE id = ?",
            (location.x, location.y, CURRENT_USER_ID),
        )
        return find_attendee(connection, CURRENT_USER_ID)


@app.delete("/api/location")
def clear_location():
    with database() as connection:
        connection.execute("UPDATE attendees SET map_x = NULL, map_y = NULL WHERE id = ?", (CURRENT_USER_ID,))
        return {"location": None}
