from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query
from database import get_supabase_client

router = APIRouter(tags=["Timetable"])


PERIOD_START_TIMES: dict[int, time] = {
    1: time(8, 0),
    2: time(8, 40),
    3: time(9, 20),
    4: time(10, 0),
    5: time(11, 40),
    6: time(12, 20),
    7: time(13, 0),
    8: time(13, 40),
}

@router.get("/timetable")
def get_timetable(day: str = Query(...), period: int = Query(..., ge=1, le=8)):
    day = day.title()
    supabase = get_supabase_client()
    response = (
        supabase.table("timetable")
        .select("id,day,period_number,class_name,teacher_id,subject,room,teachers(name)")
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
            "room": row["room"]
        })
    return {"day": day, "period": period, "entries": entries}

@router.get("/free-teachers")
def get_free_teachers(day: str = Query(...), period: int = Query(..., ge=1, le=8)):
    day = day.title()
    supabase = get_supabase_client()
    all_teachers = supabase.table("teachers").select("id,name,subjects,max_extra").execute()
    if not all_teachers.data:
        raise HTTPException(status_code=404, detail="No teachers found")
    busy_teachers = (
        supabase.table("timetable")
        .select("teacher_id")
        .eq("day", day)
        .eq("period_number", period)
        .execute()
    )
    busy_teacher_ids = {row["teacher_id"] for row in (busy_teachers.data or [])}
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
    window_end = now + timedelta(minutes=minutes_ahead)
    today_day_name = now.strftime("%A")
    tomorrow_day_name = (now + timedelta(days=1)).strftime("%A")
    window_crosses_midnight = window_end.date() != now.date()

    upcoming_periods: list[dict] = []
    for period_number, period_start_time in PERIOD_START_TIMES.items():
        start_dt_today = datetime.combine(now.date(), period_start_time, tzinfo=ist)

        if now <= start_dt_today <= window_end:
            upcoming_periods.append(
                {
                    "day": today_day_name,
                    "period_number": period_number,
                    "period_start_time": period_start_time.strftime("%H:%M:%S"),
                }
            )
            continue

        if window_crosses_midnight:
            start_dt_tomorrow = start_dt_today + timedelta(days=1)
            if now <= start_dt_tomorrow <= window_end:
                upcoming_periods.append(
                    {
                        "day": tomorrow_day_name,
                        "period_number": period_number,
                        "period_start_time": period_start_time.strftime("%H:%M:%S"),
                    }
                )

    if not upcoming_periods:
        return []

    target_days = [today_day_name]
    if window_crosses_midnight:
        target_days.append(tomorrow_day_name)

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


@router.get("/timetable/debug-periods")
def debug_periods():
    """
    Temporary debug endpoint to inspect today's IST day match and raw timetable data.
    """
    supabase = get_supabase_client()
    ist = ZoneInfo("Asia/Kolkata")
    now_ist = datetime.now(tz=ist)
    today_day_name = now_ist.strftime("%A")

    timetable_response = (
        supabase.table("timetable")
        .select("*")
        .eq("day", today_day_name)
        .order("period_number")
        .execute()
    )
    rows = timetable_response.data or []
    periods_found = sorted(
        {
            row.get("period_number")
            for row in rows
            if row.get("period_number") is not None
        }
    )

    return {
        "current_ist_time": now_ist.isoformat(),
        "today_day_name_ist": today_day_name,
        "periods_found": periods_found,
        "total_rows": len(rows),
        "rows": rows,
    }
