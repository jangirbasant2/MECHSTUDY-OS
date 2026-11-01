#!/usr/bin/env python3
"""Validate the derived index against the app database and the files on disk.

``tools/build_index.py`` writes CSV/JSON files. Those files are only useful if
they are actually true, so this script re-derives the important numbers from the
database and the filesystem and fails loudly when they disagree.

It checks, in order:

1.  Every expected file exists and parses.
2.  The document inventory matches the database row for row, and every file the
    database says is available is still on disk with the recorded size.
3.  The syllabus export contains the full curriculum, marks General Aptitude as
    UNVERIFIED (it is not in the official ME PDF) and contains no Technical
    Communication subject, unit or topic.
4.  Every RTU<->GATE mapping is transparent: an allowed status and a basis that
    states the similarity score and says no page-level evidence was used.
5.  Every document-topic link points at a topic that exists in the export.
6.  The summary counts in ``index.json`` match the CSV files.

Usage:
    python tools/validate_index.py
    python tools/validate_index.py --db PATH --index DIR

Exit codes: 0 = every check passed, 1 = at least one check failed.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sqlite3
import sys
from pathlib import Path

APP_NAME = "MECHSTUDY OS"
DEFAULT_DB = Path(os.environ.get("APPDATA", "")) / APP_NAME / "data" / "mechstudy.db"
INDEX_DIR = Path(__file__).resolve().parent.parent / "data" / "index"

# The curriculum is transcribed from syllabus.pdf and the official GATE 2027 ME
# syllabus PDF. These totals are asserted in tests/unit/syllabus-data.test.mjs
# too, so a drift between the app and the export cannot go unnoticed.
RTU_SUBJECTS = 10
RTU_THEORY_SUBJECTS = 6
RTU_PRACTICAL_SUBJECTS = 4
RTU_THEORY_CREDITS = 17
RTU_PRACTICAL_CREDITS = 6
RTU_UNITS = 34
RTU_TOPICS = 248
GATE_SECTIONS = 5
GATE_TOPICS = 165

ALLOWED_MAPPING_STATUS = {"INFERRED", "PARTIALLY_VERIFIED", "VERIFIED", "UNVERIFIED", "NO_MATCH"}
FORBIDDEN_SUBSTRING = "technical communication"


class Report:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.passes = 0

    def check(self, label: str, condition: bool, detail: str = "") -> bool:
        if condition:
            self.passes += 1
            print(f"  PASS  {label}")
        else:
            message = f"{label}: {detail}" if detail else label
            self.failures.append(message)
            print(f"  FAIL  {message}")
        return condition


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def resolve_db(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    env = os.environ.get("MECHSTUDY_DB_PATH")
    return Path(env) if env else DEFAULT_DB


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", help="path to mechstudy.db (default: %%APPDATA%%\\MECHSTUDY OS\\data\\mechstudy.db)")
    parser.add_argument("--index", help=f"index directory (default: {INDEX_DIR})")
    args = parser.parse_args()

    db_path = resolve_db(args.db)
    index_dir = Path(args.index) if args.index else INDEX_DIR

    print(f"database : {db_path}")
    print(f"index    : {index_dir}")

    report = Report()

    print("\n1. index files")
    expected = ["index.json", "file_inventory.csv", "syllabus.csv", "topic_mappings.csv", "document_topic_links.csv"]
    missing = [name for name in expected if not (index_dir / name).exists()]
    if not report.check("all index files exist", not missing, f"missing {', '.join(missing)}"):
        print("\nCannot continue without the index files. Run: npm run tools:build-index")
        return 1

    summary = json.loads((index_dir / "index.json").read_text(encoding="utf-8"))
    inventory = read_csv(index_dir / "file_inventory.csv")
    syllabus = read_csv(index_dir / "syllabus.csv")
    mappings = read_csv(index_dir / "topic_mappings.csv")
    links = read_csv(index_dir / "document_topic_links.csv")

    for key in ("generated_at", "source_database", "counts", "notes"):
        report.check(f"index.json has '{key}'", key in summary)

    print("\n2. document inventory vs database and disk")
    if not report.check("database exists", db_path.exists(), str(db_path)):
        return 1

    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        db_docs = conn.execute(
            """SELECT d.id, d.filename, d.path, d.size_bytes, d.page_count, d.has_text_layer,
                      d.material_type, d.available
               FROM documents d ORDER BY d.id"""
        ).fetchall()
        db_subjects = conn.execute(
            """SELECT s.code, s.name, s.credits, s.is_practical, s.verification, v.exam_type
               FROM subjects s JOIN syllabus_versions v ON v.id = s.version_id"""
        ).fetchall()
        db_mappings = conn.execute("SELECT status, basis FROM topic_mappings").fetchall()
    finally:
        conn.close()

    report.check(
        "inventory row count matches the database",
        len(inventory) == len(db_docs),
        f"csv {len(inventory)} vs db {len(db_docs)}",
    )

    csv_by_id = {int(row["id"]): row for row in inventory}
    report.check("inventory ids are unique", len(csv_by_id) == len(inventory))
    report.check(
        "inventory covers exactly the database ids",
        set(csv_by_id) == {row["id"] for row in db_docs},
    )

    size_mismatch: list[str] = []
    missing_files: list[str] = []
    no_hash: list[str] = []
    for row in db_docs:
        csv_row = csv_by_id.get(row["id"])
        if csv_row is None:
            continue
        if (csv_row["filename"], csv_row["path"]) != (row["filename"], row["path"]):
            report.check(f"document {row['id']} filename/path", False, "csv disagrees with database")
        if not csv_row["sha256"]:
            no_hash.append(row["filename"])
        path = Path(csv_row["path"])
        if not path.exists():
            if row["available"]:
                missing_files.append(row["filename"])
            continue
        if path.stat().st_size != int(csv_row["size_bytes"] or 0):
            size_mismatch.append(row["filename"])

    report.check("every available document still exists on disk", not missing_files,
                 f"{len(missing_files)} missing, e.g. {missing_files[:3]}")
    report.check("recorded sizes match the files on disk", not size_mismatch,
                 f"{len(size_mismatch)} mismatched, e.g. {size_mismatch[:3]}")
    report.check("every document has a content hash", not no_hash,
                 f"{len(no_hash)} without sha256, e.g. {no_hash[:3]}")

    report.check(
        "inventory never claims a verified subject from a filename guess",
        all(row["subject_source"] in {"none", "filename", "manual"} for row in inventory),
    )

    print("\n3. syllabus export")
    report.check("syllabus export is not empty", len(syllabus) > 0)

    rtu_rows = [r for r in syllabus if r["exam_type"] == "RTU"]
    gate_rows = [r for r in syllabus if r["exam_type"] == "GATE"]
    rtu_subjects = {r["subject_code"]: r for r in rtu_rows}
    gate_subjects = {r["subject_code"]: r for r in gate_rows}

    report.check("RTU subject count", len(rtu_subjects) == RTU_SUBJECTS,
                 f"expected {RTU_SUBJECTS}, got {len(rtu_subjects)}")
    theory = [r for r in rtu_subjects.values() if int(r["is_practical"]) == 0]
    practical = [r for r in rtu_subjects.values() if int(r["is_practical"]) == 1]
    report.check("RTU theory subject count", len(theory) == RTU_THEORY_SUBJECTS,
                 f"expected {RTU_THEORY_SUBJECTS}, got {len(theory)}")
    report.check("RTU practical subject count", len(practical) == RTU_PRACTICAL_SUBJECTS,
                 f"expected {RTU_PRACTICAL_SUBJECTS}, got {len(practical)}")
    # `credits` is a REAL column, so the CSV holds e.g. "3.0".
    theory_credits = sum(float(r["credits"]) for r in theory)
    practical_credits = sum(float(r["credits"]) for r in practical)
    report.check(
        "RTU theory credits",
        theory_credits == RTU_THEORY_CREDITS,
        f"expected {RTU_THEORY_CREDITS}, got {theory_credits}",
    )
    report.check(
        "RTU practical credits",
        practical_credits == RTU_PRACTICAL_CREDITS,
        f"expected {RTU_PRACTICAL_CREDITS}, got {practical_credits}",
    )
    report.check(
        "RTU units",
        len({r["unit_id"] for r in rtu_rows}) == RTU_UNITS,
        f"expected {RTU_UNITS}, got {len({r['unit_id'] for r in rtu_rows})}",
    )
    report.check(
        "RTU topics",
        len({r["topic_id"] for r in rtu_rows}) == RTU_TOPICS,
        f"expected {RTU_TOPICS}, got {len({r['topic_id'] for r in rtu_rows})}",
    )
    report.check(
        "every RTU subject has at least one unit and topic",
        all(
            any(r["unit_id"] and r["topic_id"] for r in rtu_rows if r["subject_code"] == code)
            for code in rtu_subjects
        ),
    )

    report.check("GATE section count", len(gate_subjects) == GATE_SECTIONS,
                 f"expected {GATE_SECTIONS}, got {len(gate_subjects)}")
    report.check(
        "GATE topic count",
        len({r["topic_id"] for r in gate_rows}) == GATE_TOPICS,
        f"expected {GATE_TOPICS}, got {len({r['topic_id'] for r in gate_rows})}",
    )

    ga = gate_subjects.get("GATE-ME-GA")
    if report.check("General Aptitude section present", ga is not None):
        report.check(
            "General Aptitude is exported as UNVERIFIED",
            ga["verification"] == "UNVERIFIED",
            f"got {ga['verification']} - the ME syllabus PDF does not contain GA",
        )
    report.check(
        "verified GATE sections stay VERIFIED",
        all(r["verification"] != "UNVERIFIED" for code, r in gate_subjects.items() if code != "GATE-ME-GA"),
    )

    # The explicit user requirement: Technical Communication is out of scope.
    haystacks = {
        "syllabus.csv": (index_dir / "syllabus.csv").read_text(encoding="utf-8"),
        "topic_mappings.csv": (index_dir / "topic_mappings.csv").read_text(encoding="utf-8"),
        "index.json": (index_dir / "index.json").read_text(encoding="utf-8"),
    }
    for name, text in haystacks.items():
        report.check(f"no Technical Communication in {name}", FORBIDDEN_SUBSTRING not in text.lower())
    report.check(
        "no Technical Communication subject code",
        not any(code in {"3ME1-02", "4ME1-02"} for code in rtu_subjects),
    )

    report.check(
        "every exported subject row has a subject name",
        all(r["subject_name"].strip() for r in syllabus),
    )
    report.check(
        "every exported topic row has a topic title",
        all(r["topic_title"].strip() for r in syllabus if r["topic_id"]),
    )

    print("\n4. RTU <-> GATE mappings")
    report.check(
        "mapping row count matches the database",
        len(mappings) == len(db_mappings),
        f"csv {len(mappings)} vs db {len(db_mappings)}",
    )
    bad_status = sorted({m["status"] for m in mappings} - ALLOWED_MAPPING_STATUS)
    report.check("all mapping statuses are known values", not bad_status, f"unexpected {bad_status}")
    report.check(
        "no mapping claims VERIFIED evidence",
        not any(m["status"] == "VERIFIED" for m in mappings),
        "lexical matches must stay INFERRED / PARTIALLY_VERIFIED",
    )
    report.check(
        "every mapping states a basis",
        all(m["basis"].strip() for m in mappings),
        f"{sum(1 for m in mappings if not m['basis'].strip())} without basis",
    )
    report.check(
        "every mapping records the similarity score",
        all("score " in m["basis"] for m in mappings),
    )
    report.check(
        "every mapping says no page-level evidence was used",
        all("No PDF page-level evidence was used" in m["basis"] for m in mappings),
    )
    report.check(
        "every mapping names both sides",
        all(m["rtu_subject"].strip() and m["gate_section"].strip() for m in mappings),
    )
    report.check(
        "no mapping links a topic to itself",
        not any(
            m["rtu_subject"] == m["gate_section"]
            and m["rtu_unit"] == m["gate_unit"]
            and m["rtu_topic"] == m["gate_topic"]
            for m in mappings
        ),
    )

    print("\n5. document-topic links")
    topic_keys = {(r["subject_code"], r["topic_title"]) for r in syllabus if r["topic_id"]}
    dangling = [
        f"{link['subject_code']}/{link['topic_title']}"
        for link in links
        if (link["subject_code"], link["topic_title"]) not in topic_keys
    ]
    report.check("every link points at an exported topic", not dangling,
                 f"dangling: {dangling[:3]}")
    report.check(
        "every link names an existing document",
        all(link["filename"] in {row["filename"] for row in inventory} for link in links),
    )

    print("\n6. summary counts")
    counts = summary["counts"]
    report.check("counts.documents", counts["documents"] == len(inventory),
                 f"{counts['documents']} vs {len(inventory)}")
    report.check("counts.syllabus_rows", counts["syllabus_rows"] == len(syllabus),
                 f"{counts['syllabus_rows']} vs {len(syllabus)}")
    report.check("counts.topic_mappings", counts["topic_mappings"] == len(mappings),
                 f"{counts['topic_mappings']} vs {len(mappings)}")
    report.check("counts.document_topic_links", counts["document_topic_links"] == len(links),
                 f"{counts['document_topic_links']} vs {len(links)}")
    report.check(
        "counts.total_pages",
        counts["total_pages"] == sum(int(row["page_count"] or 0) for row in inventory),
    )
    report.check(
        "counts.total_bytes",
        counts["total_bytes"] == sum(int(row["size_bytes"] or 0) for row in inventory),
    )
    report.check(
        "counts.documents_available",
        counts["documents_available"] == sum(1 for row in inventory if row["available"] == "1"),
    )

    total = report.passes + len(report.failures)
    print(f"\n{report.passes}/{total} checks passed")
    if report.failures:
        print("\nFAILED:")
        for failure in report.failures:
            print(f"  - {failure}")
        return 1

    print("Index is consistent with the database and the files on disk.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
