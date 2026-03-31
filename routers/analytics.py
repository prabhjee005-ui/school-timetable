from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta

from fastapi import APIRouter

from database import get_supabase_client


router = APIRouter(tags=["Analytics"])


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


@router.get("/attendance-stats")
def get_attendance_stats():
    supabase = get_supabase_client()

    absences_rows = (
        supabase.table("absences")
        .select("teacher_id,date,period_number,teachers(name)")
        .execute()
    ).data or []

    adjustments_rows = (
        supabase.table("adjustments")
        .select("covering_teacher_id,teachers!adjustments_covering_teacher_id_fkey(name)")
        .execute()
    ).data or []

    most_absent_counter: Counter[tuple[str, str]] = Counter()
    absences_by_week_counter: Counter[str] = Counter()
    disrupted_period_counter: Counter[int] = Counter()

    today = datetime.now().date()
    current_week_start = _week_start(today)
    last_8_week_starts = [current_week_start - timedelta(weeks=i) for i in range(7, -1, -1)]
    last_8_week_keys = {d.isoformat() for d in last_8_week_starts}

    for row in absences_rows:
        teacher_id = row.get("teacher_id")
        teacher_rel = row.get("teachers")
        if isinstance(teacher_rel, list):
            teacher_name = (teacher_rel[0] or {}).get("name") if teacher_rel else None
        else:
            teacher_name = (teacher_rel or {}).get("name")
        teacher_name = teacher_name or str(teacher_id or "Unknown")

        if teacher_id:
            most_absent_counter[(str(teacher_id), teacher_name)] += 1

        period_number = row.get("period_number")
        if isinstance(period_number, int):
            disrupted_period_counter[period_number] += 1

        date_str = row.get("date")
        if not date_str:
            continue
        try:
            absence_date = datetime.strptime(str(date_str), "%Y-%m-%d").date()
        except ValueError:
            continue

        wk = _week_start(absence_date).isoformat()
        if wk in last_8_week_keys:
            absences_by_week_counter[wk] += 1

    covering_workload_counter: Counter[str] = Counter()
    for row in adjustments_rows:
        teacher_rel = row.get("teachers")
        if isinstance(teacher_rel, list):
            teacher_name = (teacher_rel[0] or {}).get("name") if teacher_rel else None
        else:
            teacher_name = (teacher_rel or {}).get("name")
        cover_id = row.get("covering_teacher_id")
        label = teacher_name or str(cover_id or "Unknown")
        covering_workload_counter[label] += 1

    most_absent_teachers = [
        {"teacher_name": teacher_name, "absence_count": count}
        for (_, teacher_name), count in sorted(
            most_absent_counter.items(),
            key=lambda x: (-x[1], x[0][1]),
        )
    ]

    absences_by_week = [
        {
            "week_start": wk.isoformat(),
            "absence_count": absences_by_week_counter.get(wk.isoformat(), 0),
        }
        for wk in last_8_week_starts
    ]

    most_disrupted_periods = [
        {"period_number": period, "disruption_count": count}
        for period, count in sorted(disrupted_period_counter.items(), key=lambda x: (-x[1], x[0]))
    ]

    covering_workload = [
        {"teacher_name": teacher_name, "cover_count": count}
        for teacher_name, count in sorted(covering_workload_counter.items(), key=lambda x: (-x[1], x[0]))
    ]

    return {
        "most_absent_teachers": most_absent_teachers,
        "absences_by_week": absences_by_week,
        "most_disrupted_periods": most_disrupted_periods,
        "covering_workload": covering_workload,
    }

