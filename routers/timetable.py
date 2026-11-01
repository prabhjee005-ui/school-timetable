from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Query
from database import get_supabase_client
from routers.schedule import load_schedule_slots, upcoming_teaching_starts

router = APIRouter(tags=["Timetable"])
SPECIAL_TIMETABLE_SUBJECTS = {"OPT", "RECESS"}

class TimetableEntry(BaseModel):
    day: str
    period_number: int = Field(..., ge=1, le=9)
    class_name: str
    teacher_id: str | None = None
    subject: str
    group_key: str = ""
    room: str | None = None

class TimetableClearCell(BaseModel):
    day: str
    period_number: int = Field(..., ge=1, le=9)
    class_name: str

class BulkTimetablePayload(BaseModel):
    entries: list[TimetableEntry]
    clear: list[TimetableClearCell] = Field(default_factory=list)


def _validate_timetable_changes(supabase, entries: list[dict], clear: list[dict], *, excluded_id: int | None = None) -> None:
    settings_rows = supabase.table("settings").select("value").eq("id", "school_config").limit(1).execute().data or []
    config = settings_rows[0].get("value", {}) if settings_rows else {}
    allowed_days = set(config.get("operating_days") or ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
    allowed_classes = set(config.get("class_names") or [])

    assignments = supabase.table("assignments").select(
        "staff_id,subject,target_type,sections"
    ).execute().data or []
    optional_groups = {
        section
        for assignment in assignments
        if assignment.get("target_type") == "optional_group"
        for section in assignment.get("sections") or []
    }
    allowed_classes.update(optional_groups)

    for item in entries + clear:
        item["day"] = str(item["day"]).title()
        if item["day"] not in allowed_days:
            raise HTTPException(status_code=422, detail=f"{item['day']} is not an operating day")
        if allowed_classes and item["class_name"] not in allowed_classes:
            raise HTTPException(status_code=422, detail=f"Unknown class section: {item['class_name']}")

    entry_keys = [(item["day"], item["period_number"], item["class_name"], item["subject"], item.get("group_key", "")) for item in entries]
    if len(entry_keys) != len(set(entry_keys)):
        raise HTTPException(status_code=422, detail="A subject can only appear once in a class-period")

    active_teachers = supabase.table("teachers").select("id").eq("role", "teacher").execute().data or []
    active_codes = {row["id"] for row in active_teachers}
    staff_rows = supabase.table("staff").select("id,staff_code").execute().data or []
    code_by_staff_id = {row["id"]: row["staff_code"] for row in staff_rows}
    valid_single: set[tuple[str, str, str]] = set()
    valid_combined: set[tuple[str, str, frozenset[str]]] = set()
    valid_optional: set[tuple[str, str, str]] = set()
    for assignment in assignments:
        code = code_by_staff_id.get(assignment.get("staff_id"))
        if not code:
            continue
        subject = assignment.get("subject") or "Unspecified subject"
        sections = frozenset(assignment.get("sections") or [])
        if assignment.get("target_type") == "section":
            valid_single.update((code, subject, section) for section in sections)
        elif assignment.get("target_type") == "combined_group":
            valid_combined.add((code, subject, sections))
        elif assignment.get("target_type") == "optional_group":
            valid_optional.update((code, subject, section) for section in sections)

    for item in entries:
        subject_key = str(item.get("subject") or "").strip().upper()
        teacher_id = item.get("teacher_id")
        if subject_key in SPECIAL_TIMETABLE_SUBJECTS:
            if teacher_id:
                raise HTTPException(status_code=422, detail=f"{subject_key} entries cannot have a teacher")
            if item["class_name"] in optional_groups:
                raise HTTPException(status_code=422, detail=f"{subject_key} is only valid on a regular class timetable")
            item["subject"] = subject_key
            continue
        if not teacher_id:
            raise HTTPException(status_code=422, detail="A teacher is required for regular timetable entries")
        if item["teacher_id"] not in active_codes:
            raise HTTPException(status_code=422, detail=f"Inactive or unknown staff code: {item['teacher_id']}")
        if item["class_name"] in optional_groups:
            is_assigned = (item["teacher_id"], item["subject"], item["class_name"]) in valid_optional
        else:
            is_assigned = (item["teacher_id"], item["subject"], item["class_name"]) in valid_single or any(
                code == item["teacher_id"] and subject == item["subject"] and item["class_name"] in sections
                for code, subject, sections in valid_combined
            )
        if not is_assigned:
            raise HTTPException(status_code=422, detail=f"{item['teacher_id']} is not allocated to {item['class_name']} for {item['subject']}")

    current = supabase.table("timetable").select("id,day,period_number,class_name,teacher_id,subject,group_key,room").range(0, 4999).execute().data or []
    clear_keys = {(row["day"], row["period_number"], row["class_name"]) for row in clear}
    changed_keys = {
        (row["day"], row["period_number"], row["class_name"], row["subject"], row.get("group_key", ""))
        for row in entries
    }
    merged = {
        (row["day"], row["period_number"], row["class_name"], row["subject"], row.get("group_key", "")): row
        for row in current
        if row.get("id") != excluded_id
        and (row["day"], row["period_number"], row["class_name"]) not in clear_keys
        and (row["day"], row["period_number"], row["class_name"], row["subject"], row.get("group_key", "")) not in changed_keys
    }
    merged.update({
        (row["day"], row["period_number"], row["class_name"], row["subject"], row.get("group_key", "")): row
        for row in entries
    })

    rows_by_class_slot: dict[tuple[str, str, int], list[dict]] = {}
    for row in merged.values():
        rows_by_class_slot.setdefault((row["day"], row["class_name"], row["period_number"]), []).append(row)
    for (_, class_name, period_number), rows in rows_by_class_slot.items():
        has_marker = any(str(row.get("subject") or "").strip().upper() in SPECIAL_TIMETABLE_SUBJECTS for row in rows)
        if has_marker and len(rows) > 1:
            raise HTTPException(
                status_code=409,
                detail=f"{class_name} period {period_number} cannot mix OPT/RECESS with teaching entries",
            )

    by_teacher_slot: dict[tuple[str, str, int], list[dict]] = {}
    for row in merged.values():
        if not row.get("teacher_id"):
            continue
        by_teacher_slot.setdefault((row["day"], row["teacher_id"], row["period_number"]), []).append(row)
    for (_, teacher_code, _), rows in by_teacher_slot.items():
        if len(rows) <= 1:
            continue
        classes = frozenset(row["class_name"] for row in rows)
        subjects = {row["subject"] for row in rows}
        if len(subjects) != 1 or (teacher_code, next(iter(subjects)), classes) not in valid_combined:
            raise HTTPException(status_code=409, detail=f"{teacher_code} is assigned to multiple classes in the same period")

@router.get("/timetable/all")
def get_all_timetable():
    supabase = get_supabase_client()
    response = supabase.table("timetable").select("*").range(0, 4999).execute()
    return {"entries": response.data or []}


@router.get("/timetable/allocation-review")
def review_allocation_for_timetable():
    """Summarize allocation load and valid teacher/subject choices per section."""
    supabase = get_supabase_client()
    settings = supabase.table("settings").select("value").eq("id", "school_config").limit(1).execute().data or []
    config = settings[0].get("value", {}) if settings else {}
    sections = config.get("class_names") or []
    operating_days = config.get("operating_days") or ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    periods_per_day = int(config.get("num_periods") or 9)
    capacity = len(operating_days) * periods_per_day

    staff_rows = supabase.table("staff").select("id,staff_code,full_name,is_active").eq("is_active", True).execute().data or []
    staff_by_id = {row["id"]: row for row in staff_rows}
    assignments = supabase.table("assignments").select(
        "id,staff_id,subject,target_type,sections,periods_per_week,raw_text"
    ).execute().data or []

    loads = {section: 0 for section in sections}
    options = {section: [] for section in sections}
    unparsed_count = 0
    unknown_period_count = 0
    optional_rows = 0
    optional_periods = 0
    for assignment in assignments:
        target_type = assignment.get("target_type")
        period_count = assignment.get("periods_per_week")
        target_sections = assignment.get("sections") or []
        if target_type == "unparsed":
            unparsed_count += 1
            continue
        if target_type == "optional_group":
            optional_rows += 1
            if isinstance(period_count, int):
                optional_periods += period_count
            else:
                unknown_period_count += 1
            continue
        if target_type not in {"section", "combined_group"}:
            continue
        if not isinstance(period_count, int):
            unknown_period_count += 1
            continue

        staff = staff_by_id.get(assignment.get("staff_id"))
        for section in target_sections:
            if section not in loads:
                continue
            loads[section] += period_count
            if staff:
                options[section].append({
                    "staff_code": staff["staff_code"],
                    "full_name": staff["full_name"],
                    "subject": assignment.get("subject") or "Unspecified subject",
                    "target_type": target_type,
                    "periods_per_week": period_count,
                })

    for section_options in options.values():
        section_options.sort(key=lambda item: (item["full_name"].casefold(), item["subject"].casefold()))

    return {
        "sections": sections,
        "operating_days": operating_days,
        "periods_per_day": periods_per_day,
        "capacity_per_section": capacity,
        "section_loads": loads,
        # These totals include different student subject groups that run in
        # parallel, so they are not comparable to the section's clock-slot capacity.
        "parallel_group_periods_by_section": loads,
        "allocation_counts_include_parallel_groups": True,
        "unparsed_assignment_count": unparsed_count,
        "unknown_period_count": unknown_period_count,
        "optional_assignment_count": optional_rows,
        "optional_periods_per_week": optional_periods,
        "assignment_options_by_section": options,
    }

@router.post("/timetable/bulk")
def bulk_save_timetable(payload: BulkTimetablePayload):
    supabase = get_supabase_client()
    # Parallel subject groups share a class-period; subject distinguishes each row.
    data = [entry.model_dump() for entry in payload.entries]
    clear = [cell.model_dump() for cell in payload.clear]
    _validate_timetable_changes(supabase, data, clear)

    replace_cells = {(cell["day"], cell["period_number"], cell["class_name"]) for cell in clear}
    desired_keys = {
        (row["day"], row["period_number"], row["class_name"], row["subject"], row.get("group_key", ""))
        for row in data
    }
    stale_rows = []
    if replace_cells:
        existing_rows = supabase.table("timetable").select(
            "id,day,period_number,class_name,subject,group_key"
        ).range(0, 4999).execute().data or []
        stale_rows = [
            row for row in existing_rows
            if (row["day"], row["period_number"], row["class_name"]) in replace_cells
            and (row["day"], row["period_number"], row["class_name"], row["subject"], row.get("group_key", "")) not in desired_keys
        ]

    response = supabase.table("timetable").upsert(data, on_conflict="day,period_number,class_name,subject,group_key").execute() if data else None
    # Upsert first so a failed write cannot erase the existing cell contents.
    for row in stale_rows:
        supabase.table("timetable").delete().eq("id", row["id"]).execute()
    return {"message": f"Successfully updated {len(data)} entries", "count": len(response.data or []) if response else 0, "cleared": len(clear)}

@router.post("/timetable")
def create_timetable_entry(entry: TimetableEntry):
    supabase = get_supabase_client()
    data = entry.model_dump()
    _validate_timetable_changes(supabase, [data], [])
    response = supabase.table("timetable").upsert(data, on_conflict="day,period_number,class_name,subject,group_key").execute()
    return {"message": "Entry created/updated", "data": response.data[0] if response.data else None}

@router.put("/timetable/{entry_id}")
def update_timetable_entry(entry_id: int, entry: TimetableEntry):
    supabase = get_supabase_client()
    data = entry.model_dump()
    _validate_timetable_changes(supabase, [data], [], excluded_id=entry_id)
    response = supabase.table("timetable").update(data).eq("id", entry_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Entry updated", "data": response.data[0]}


@router.get("/timetable")
def get_timetable(day: str = Query(...), period: int = Query(..., ge=1, le=9)):
    day = day.title()
    supabase = get_supabase_client()
    response = (
        supabase.table("timetable")
        .select("id,day,period_number,class_name,teacher_id,subject,group_key,room,teachers(name)")
        .eq("day", day)
        .eq("period_number", period)
        .order("class_name")
        .execute()
    )
    entries = []
    for row in (response.data or []):
        teacher_name = row.get("teachers", {}).get("name") if row.get("teachers") else None
        entries.append({
            "id": row["id"],
            "day": row["day"],
            "period_number": row["period_number"],
            "class_name": row["class_name"],
            "teacher_id": row["teacher_id"],
            "teacher_name": teacher_name,
            "subject": row["subject"],
            "group_key": row.get("group_key", ""),
            "room": row["room"]
        })
    return {"day": day, "period": period, "entries": entries}

@router.get("/free-teachers")
def get_free_teachers(
    day: str = Query(...),
    period: int = Query(..., ge=1, le=9),
    date: date = Query(...),
):
    day = day.title()
    if date.strftime("%A") != day:
        raise HTTPException(status_code=400, detail="day must match date")
    supabase = get_supabase_client()
    all_teachers = supabase.table("teachers").select("id,name,subjects,max_extra,role").eq("role", "teacher").execute()
    if not all_teachers.data:
        raise HTTPException(status_code=404, detail="No teachers found")
    busy_teachers = (
        supabase.table("timetable")
        .select("teacher_id")
        .eq("day", day)
        .eq("period_number", period)
        .execute()
    )
    busy_teacher_ids = {row["teacher_id"] for row in (busy_teachers.data or []) if row.get("teacher_id")}
    covering_teachers = (
        supabase.table("adjustments")
        .select("covering_teacher_id")
        .eq("date", date.isoformat())
        .eq("period_number", period)
        .execute()
    )
    busy_teacher_ids.update(
        row["covering_teacher_id"]
        for row in (covering_teachers.data or [])
        if row.get("covering_teacher_id")
    )
    free_teacher_list = [
        teacher for teacher in all_teachers.data if teacher["id"] not in busy_teacher_ids
    ]
    return {
        "day": day,
        "period": period,
        "busy_teacher_ids": list(busy_teacher_ids),
        "free_teachers": free_teacher_list,
    }


@router.get("/teachers")
def get_teachers():
    """
    Return all teachers with IDs and names for frontend dropdowns.
    """
    supabase = get_supabase_client()
    response = (
        supabase.table("teachers")
        .select("id,name")
        .eq("role", "teacher")
        .order("name")
        .execute()
    )
    return {"teachers": response.data or []}


@router.get("/timetable/upcoming-periods")
def get_upcoming_periods(
    minutes_ahead: int = Query(5, ge=0),
) -> list[dict]:
    """
    Return timetable entries for classes whose period starts within `minutes_ahead`.
    """
    supabase = get_supabase_client()

    ist = ZoneInfo("Asia/Kolkata")
    now = datetime.now(tz=ist)
    today_day_name = now.strftime("%A")
    window_end = now + timedelta(minutes=minutes_ahead)
    window_crosses_midnight = window_end.date() != now.date()

    upcoming_periods = upcoming_teaching_starts(
        load_schedule_slots(), now, minutes_ahead
    )

    if not upcoming_periods:
        return []

    target_days = list(dict.fromkeys(p["day"] for p in upcoming_periods)) or [today_day_name]

    period_start_map = {
        (p["day"], p["period_number"]): p["period_start_time"] for p in upcoming_periods
    }
    upcoming_period_numbers = sorted({p["period_number"] for p in upcoming_periods})

    timetable_response = (
        supabase.table("timetable")
        .select(
            "day,teacher_id,period_number,class_name,subject,room,teachers(name,email)"
        )
        .in_("day", target_days)
        .in_("period_number", upcoming_period_numbers)
        .execute()
    )

    rows = timetable_response.data or []
    results: list[dict] = []
    for row in rows:
        row_day = (row.get("day") or "").strip().title()
        row_period = row.get("period_number")
        if (row_day, row_period) not in period_start_map:
            continue

        teachers_obj = row.get("teachers") or {}
        teacher_email = teachers_obj.get("email")
        if teacher_email is None or not str(teacher_email).strip():
            continue
        results.append(
            {
                "day": row_day,
                "teacher_name": teachers_obj.get("name"),
                "teacher_email": teacher_email,
                "period_number": row_period,
                "class_name": row["class_name"],
                "subject": row["subject"],
                "room": row["room"],
                "period_start_time": period_start_map[(row_day, row_period)],
            }
        )

    return results
