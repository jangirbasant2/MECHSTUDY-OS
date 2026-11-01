#!/usr/bin/env python3
"""Build a derived, read-only index of the MECHSTUDY OS library.

The app database is the single source of truth. This script reads it (never
writes to it) and writes plain CSV/JSON files under ``data/index/`` so a human
or another agent can answer "what do I have, and what does it cover?" without
opening the app or guessing.

Nothing here invents coverage. A document is only linked to a syllabus topic
when the user linked it in the app (``topic_documents``); filename-based subject
guesses are exported with ``subject_source`` so they can never be mistaken for
evidence.

Usage:
    python tools/build_index.py                 # default database location
    python tools/build_index.py --db PATH       # explicit database
    MECHSTUDY_DB_PATH=PATH python tools/build_index.py

Exit codes: 0 = index written, 1 = database missing or unreadable.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

APP_NAME = "MECHSTUDY OS"
DEFAULT_DB = Path(os.environ.get("APPDATA", "")) / APP_NAME / "data" / "mechstudy.db"
OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "index"


def resolve_db(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    env = os.environ.get("MECHSTUDY_DB_PATH")
    if env:
        return Path(env)
    return DEFAULT_DB


def connect(path: Path) -> sqlite3.Connection:
    if not path.exists():
        raise SystemExit(
            f"Database not found: {path}\n"
            "Run the app once (or import the library) before building the index, "
            "or pass --db PATH."
        )
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def write_csv(path: Path, header: list[str], rows: list[list[object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(header)
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", help="path to mechstudy.db (default: %%APPDATA%%\\MECHSTUDY OS\\data\\mechstudy.db)")
    parser.add_argument("--out", help=f"output directory (default: {OUT_DIR})")
    args = parser.parse_args()

    db_path = resolve_db(args.db)
    out_dir = Path(args.out) if args.out else OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    conn = connect(db_path)
    try:
        documents = conn.execute(
            """
            SELECT d.id, d.filename, d.rel_path, d.path, d.size_bytes, d.page_count,
                   d.has_text_layer, d.text_chars, d.sha256, d.material_type,
                   d.subject_id, d.subject_code, d.subject_source, d.starred, d.available,
                   d.last_page, d.added_at, s.name AS subject_name
            FROM documents d
            LEFT JOIN subjects s ON s.id = d.subject_id
            ORDER BY d.filename COLLATE NOCASE
            """
        ).fetchall()

        syllabus = conn.execute(
            """
            SELECT v.exam_type, v.name AS version_name, s.id AS subject_id, s.code, s.name AS subject_name,
                   s.semester, s.credits, s.is_practical, s.verification,
                   u.id AS unit_id, u.number AS unit_number, u.title AS unit_title,
                   t.id AS topic_id, t.number AS topic_number, t.title AS topic_title
            FROM syllabus_versions v
            JOIN subjects s ON s.version_id = v.id
            LEFT JOIN units u ON u.subject_id = s.id
            LEFT JOIN topics t ON t.unit_id = u.id
            ORDER BY v.exam_type, s.sort_order, s.id, u.sort_order, t.sort_order, t.id
            """
        ).fetchall()

        mappings = conn.execute(
            """
            SELECT m.status, m.basis, m.evidence,
                   rt.title AS rtu_topic, ru.title AS rtu_unit, rs.code AS rtu_subject,
                   gt.title AS gate_topic, gu.title AS gate_unit, gs.code AS gate_section
            FROM topic_mappings m
            JOIN topics rt ON rt.id = m.rtu_topic_id
            JOIN units ru ON ru.id = rt.unit_id
            JOIN subjects rs ON rs.id = ru.subject_id
            JOIN topics gt ON gt.id = m.gate_topic_id
            JOIN units gu ON gu.id = gt.unit_id
            JOIN subjects gs ON gs.id = gu.subject_id
            ORDER BY rs.code, rt.title
            """
        ).fetchall()

        links = conn.execute(
            """
            SELECT td.topic_id, t.title AS topic_title, u.title AS unit_title, s.code AS subject_code,
                   d.filename, td.page, td.note
            FROM topic_documents td
            JOIN topics t ON t.id = td.topic_id
            JOIN units u ON u.id = t.unit_id
            JOIN subjects s ON s.id = u.subject_id
            JOIN documents d ON d.id = td.document_id
            ORDER BY s.code, t.title
            """
        ).fetchall()

        page_sources = conn.execute(
            "SELECT source, COUNT(*) AS pages FROM document_pages GROUP BY source ORDER BY source"
        ).fetchall()

        ocr_jobs = conn.execute(
            "SELECT status, COUNT(*) AS jobs FROM ocr_jobs GROUP BY status ORDER BY status"
        ).fetchall()

        migrations = conn.execute(
            "SELECT version, name, applied_at FROM schema_migrations ORDER BY version"
        ).fetchall()
    finally:
        conn.close()

    write_csv(
        out_dir / "file_inventory.csv",
        ["id", "filename", "rel_path", "path", "size_bytes", "page_count", "has_text_layer",
         "text_chars", "sha256", "material_type", "subject_id", "subject_code", "subject_name",
         "subject_source", "starred", "available", "last_page", "added_at"],
        [[d[k] for k in (
            "id", "filename", "rel_path", "path", "size_bytes", "page_count", "has_text_layer",
            "text_chars", "sha256", "material_type", "subject_id", "subject_code", "subject_name",
            "subject_source", "starred", "available", "last_page", "added_at")] for d in documents],
    )

    write_csv(
        out_dir / "syllabus.csv",
        ["exam_type", "version_name", "subject_id", "subject_code", "subject_name", "semester",
         "credits", "is_practical", "verification", "unit_id", "unit_number", "unit_title",
         "topic_id", "topic_number", "topic_title"],
        [[r[k] for k in (
            "exam_type", "version_name", "subject_id", "code", "subject_name", "semester",
            "credits", "is_practical", "verification", "unit_id", "unit_number", "unit_title",
            "topic_id", "topic_number", "topic_title")] for r in syllabus],
    )

    write_csv(
        out_dir / "topic_mappings.csv",
        ["status", "rtu_subject", "rtu_unit", "rtu_topic", "gate_section", "gate_unit", "gate_topic",
         "basis", "evidence"],
        [[m[k] for k in ("status", "rtu_subject", "rtu_unit", "rtu_topic", "gate_section",
                         "gate_unit", "gate_topic", "basis", "evidence")] for m in mappings],
    )

    write_csv(
        out_dir / "document_topic_links.csv",
        ["subject_code", "unit_title", "topic_title", "filename", "page", "note"],
        [[r[k] for k in ("subject_code", "unit_title", "topic_title", "filename", "page", "note")]
         for r in links],
    )

    total_bytes = sum(d["size_bytes"] or 0 for d in documents)
    total_pages = sum(d["page_count"] or 0 for d in documents)

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_database": str(db_path),
        "schema_migrations": [dict(m) for m in migrations],
        "counts": {
            "documents": len(documents),
            "documents_available": sum(1 for d in documents if d["available"]),
            "documents_with_text_layer": sum(1 for d in documents if d["has_text_layer"]),
            "total_bytes": total_bytes,
            "total_pages": total_pages,
            "syllabus_rows": len(syllabus),
            "topic_mappings": len(mappings),
            "document_topic_links": len(links),
        },
        "page_text_sources": {r["source"]: r["pages"] for r in page_sources},
        "ocr_jobs": {r["status"]: r["jobs"] for r in ocr_jobs},
        "notes": [
            "This index is derived from the app database; the database is the source of truth.",
            "subject_source='filename' means the subject was guessed from the filename, not verified.",
            "topic_mappings are lexical INFERRED / PARTIALLY_VERIFIED links; they are not page-level evidence.",
            "document_topic_links only contains links the user made in the app.",
        ],
    }
    (out_dir / "index.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    print(f"index written to {out_dir}")
    print(f"  documents: {summary['counts']['documents']} "
          f"({summary['counts']['total_pages']} pages, {total_bytes / (1024 * 1024):.1f} MB)")
    print(f"  syllabus rows: {summary['counts']['syllabus_rows']}")
    print(f"  topic mappings: {summary['counts']['topic_mappings']}")
    print(f"  document-topic links: {summary['counts']['document_topic_links']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
