"""Create the NexusERP database if it doesn't exist yet. Reads connection settings from backend/.env."""

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / "backend" / ".env")

conn = psycopg.connect(
    host=os.environ["DB_HOST"], port=os.environ["DB_PORT"], user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"], dbname="postgres", autocommit=True,
)
name = os.environ.get("DB_NAME", "nexuserp")
if not conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,)).fetchone():
    conn.execute(f'CREATE DATABASE "{name}"')
    print(f"Created database {name}")
