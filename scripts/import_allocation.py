#!/usr/bin/env python3
"""Preview or import allocation CSV data into public.staff and assignments."""

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
DEFAULT_DATA = ROOT / "data" / "allocation" / "out"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as source:
        return list(csv.DictReader(source))


def split_pipe(value: str | None) -> list[str]:
    return [part.strip() for part in (value or "").split("|") if part.strip()]


def build_import_plan(teachers: list[dict[str, str]], assignments: list[dict[str, str]]) -> dict[str, Any]:
    staff_rows: list[dict[str, Any]] = []
    names_to_codes: dict[str, list[str]] = {}
    for index, teacher in enumerate(teachers, start=1):
        staff_code = f"T{index:03d}"
        full_name = teacher.get("teacher_name", "").strip()
        departments = split_pipe(teacher.get("departments"))
        staff_rows.append({
            "staff_code": staff_code,
            "full_name": full_name,
            "department": " | ".join(departments) or None,
            "roles": split_pipe(teacher.get("roles")),
        })
        names_to_codes.setdefault(full_name.casefold(), []).append(staff_code)

    assignment_rows: list[dict[str, Any]] = []
    unmatched: list[dict[str, str]] = []
    for row in assignments:
        matched_codes = names_to_codes.get(row.get("teacher_name", "").strip().casefold(), [])
        if len(matched_codes) != 1:
            unmatched.append({
                "teacher_name": row.get("teacher_name", ""),
                "source_row": row.get("source_row", ""),
                "match_count": str(len(matched_codes)),
            })
            continue
        raw_type = row.get("target_type", "").strip()
        target_type = raw_type if raw_type in {"section", "combined_group", "optional_group", "unparsed"} else "unparsed"
        assignment_rows.append({
            "staff_code": matched_codes[0],
            "subject": row.get("subject", "").strip() or None,
            "target_type": target_type,
            "sections": split_pipe(row.get("sections")),
            "periods_per_week": int(row["periods_per_week"]) if row.get("periods_per_week", "").strip().isdigit() else None,
            "raw_text": row.get("raw_text", "") or None,
        })
    return {"staff": staff_rows, "assignments": assignment_rows, "unmatched": unmatched}


def preview(plan: dict[str, Any]) -> None:
    print("Dry run: CSV payload only; no database reads or writes.")
    for table, rows in (("staff", plan["staff"]), ("assignments", plan["assignments"])):
        print(f"{table}: {len(rows)} planned rows")
        print(json.dumps(rows[:10], ensure_ascii=False, indent=2))
    print(f"assignments without one exact teacher match: {len(plan['unmatched'])}")
    print(json.dumps(plan["unmatched"], ensure_ascii=False, indent=2))


def _assignment_key(row: dict[str, Any]) -> tuple[Any, ...]:
    return (
        row.get("staff_id"), row.get("subject"), row.get("target_type"),
        tuple(row.get("sections") or []), row.get("periods_per_week"), row.get("raw_text"),
    )


def apply_import(supabase: Any, plan: dict[str, Any], force: bool = False) -> tuple[int, int]:
    if plan["unmatched"]:
        raise ValueError("Import refused: one or more assignment rows have no unique teacher match.")

    existing_staff = supabase.table("staff").select("id,staff_code").execute().data or []
    if existing_staff and not force:
        raise ValueError("Import refused: public.staff already has rows; use --force to merge by staff_code.")

    staff_payload = plan["staff"]
    if staff_payload:
        supabase.table("staff").upsert(staff_payload, on_conflict="staff_code").execute()

    rows_by_code = supabase.table("staff").select("id,staff_code").execute().data or []
    id_by_code = {row["staff_code"]: row["id"] for row in rows_by_code}
    desired = [
        {key: value for key, value in row.items() if key != "staff_code"} | {"staff_id": id_by_code[row["staff_code"]]}
        for row in plan["assignments"]
    ]
    existing_assignments = supabase.table("assignments").select(
        "staff_id,subject,target_type,sections,periods_per_week,raw_text"
    ).execute().data or []
    known = {_assignment_key(row) for row in existing_assignments}
    new_rows = []
    for row in desired:
        key = _assignment_key(row)
        if key not in known:
            new_rows.append(row)
            known.add(key)
    if new_rows:
        supabase.table("assignments").insert(new_rows).execute()
    return len(staff_payload), len(new_rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--apply", action="store_true", help="write the reviewed CSV payload to Supabase")
    parser.add_argument("--force", action="store_true", help="merge staff by staff_code when staff already has rows")
    args = parser.parse_args()
    try:
        plan = build_import_plan(
            read_csv(args.data_dir / "teachers.csv"),
            read_csv(args.data_dir / "assignments.csv"),
        )
        if not args.apply:
            preview(plan)
            return 0
        from database import get_supabase_client

        inserted_staff, inserted_assignments = apply_import(get_supabase_client(), plan, args.force)
        print(f"Import complete: {inserted_staff} staff payloads merged; {inserted_assignments} new assignments inserted.")
        return 0
    except (OSError, ValueError, KeyError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
