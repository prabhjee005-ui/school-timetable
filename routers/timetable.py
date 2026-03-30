from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query
from database import get_supabase_client

router = APIRouter(tags=["Timetable"])

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
def get_upcoming_periods(minutes_ahead: int = Query(5, ge=0)) -> list[dict]:
    """
    Return timetable entries for classes whose period starts within `minutes_ahead`.
    """
    supabase = get_supabase_client()

    now = datetime.now()
    window_end = now + timedelta(minutes=minutes_ahead)
    today_day_name = now.strftime("%A")  # e.g. "Monday"

    periods_response = (
        supabase.table("periods")
        .select("period_number,start_time")
        .order("period_number")
        .execute()
    )
    periods = periods_response.data or []

    upcoming_periods: list[dict] = []
    for p in periods:
        start_time_str = p.get("start_time")
        if not start_time_str:
            continue

        start_time = datetime.strptime(start_time_str, "%H:%M:%S").time()
        start_dt = datetime.combine(now.date(), start_time)

        # Handle the case where the window crosses midnight.
        if start_dt < now and window_end.date() != now.date():
            start_dt += timedelta(days=1)

        if now <= start_dt <= window_end:
            upcoming_periods.append(
                {
                    "period_number": p["period_number"],
                    "period_start_time": start_time_str,
                }
            )

    if not upcoming_periods:
        return []

    period_start_map = {
        p["period_number"]: p["period_start_time"] for p in upcoming_periods
    }
    upcoming_period_numbers = list(period_start_map.keys())

    timetable_response = (
        supabase.table("timetable")
        .select(
            "teacher_id,period_number,class_name,subject,room,teachers(name,email)"
        )
        .eq("day", today_day_name)
        .in_("period_number", upcoming_period_numbers)
        .execute()
    )

    rows = timetable_response.data or []
    results: list[dict] = []
    for row in rows:
        teachers_obj = row.get("teachers") or {}
        results.append(
            {
                "teacher_name": teachers_obj.get("name"),
                "teacher_email": teachers_obj.get("email"),
                "period_number": row["period_number"],
                "class_name": row["class_name"],
                "subject": row["subject"],
                "room": row["room"],
                "period_start_time": period_start_map.get(row["period_number"]),
            }
        )

    return results
