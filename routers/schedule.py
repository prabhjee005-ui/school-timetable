import os
from datetime import datetime, time, timedelta

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException

from database import get_supabase_client


load_dotenv()

router = APIRouter(tags=["Schedule"])

SCHEDULE_SLOT_COLUMNS = (
    "slot_key,slot_type,teaching_period_number,start_time,end_time,display_label,display_order"
)


def get_school_year() -> str:
    school_year = os.getenv("SCHOOL_YEAR")
    if not school_year:
        raise HTTPException(status_code=500, detail="SCHOOL_YEAR is not set")
    return school_year


def load_schedule_slots(school_year: str | None = None) -> list[dict]:
    if school_year is None:
        school_year = get_school_year()

    response = (
        get_supabase_client()
        .table("bell_schedule_slots")
        .select(SCHEDULE_SLOT_COLUMNS)
        .eq("school_year", school_year)
        .order("display_order")
        .execute()
    )
    return response.data or []


def _as_time(value: time | str) -> time:
    if isinstance(value, time):
        return value
    return time.fromisoformat(value)


def format_schedule_time(value: time | str) -> str:
    return _as_time(value).strftime("%H:%M:%S")


def find_slot_at(slots: list[dict], t: time | str) -> dict | None:
    current_time = _as_time(t)
    for slot in slots:
        start_time = _as_time(slot["start_time"])
        end_time = _as_time(slot["end_time"])
        if start_time <= current_time < end_time:
            return slot
    return None


def upcoming_teaching_starts(
    slots: list[dict], now_ist: datetime, minutes_ahead: int
) -> list[dict]:
    window_end = now_ist + timedelta(minutes=minutes_ahead)
    today_day_name = now_ist.strftime("%A")
    tomorrow_day_name = (now_ist + timedelta(days=1)).strftime("%A")
    window_crosses_midnight = window_end.date() != now_ist.date()
    upcoming: list[dict] = []

    for slot in slots:
        if slot.get("slot_type") != "TEACHING":
            continue

        slot_start_time = _as_time(slot["start_time"])
        start_dt_today = datetime.combine(
            now_ist.date(), slot_start_time, tzinfo=now_ist.tzinfo
        )
        matching_start = None
        matching_day = None

        if now_ist <= start_dt_today <= window_end:
            matching_start = start_dt_today
            matching_day = today_day_name
        elif window_crosses_midnight:
            start_dt_tomorrow = start_dt_today + timedelta(days=1)
            if now_ist <= start_dt_tomorrow <= window_end:
                matching_start = start_dt_tomorrow
                matching_day = tomorrow_day_name

        if matching_start is not None:
            upcoming.append(
                {
                    **slot,
                    "day": matching_day,
                    "period_number": slot["teaching_period_number"],
                    "period_start_time": slot_start_time.strftime("%H:%M:%S"),
                }
            )

    return upcoming


@router.get("/schedule")
def get_schedule():
    school_year = get_school_year()
    slots = load_schedule_slots(school_year)
    return {
        "school_year": school_year,
        "slots": [
            {
                "slot_key": slot["slot_key"],
                "slot_type": slot["slot_type"],
                "teaching_period_number": slot["teaching_period_number"],
                "start_time": format_schedule_time(slot["start_time"]),
                "end_time": format_schedule_time(slot["end_time"]),
                "display_label": slot["display_label"],
                "display_order": slot["display_order"],
            }
            for slot in slots
        ],
    }
