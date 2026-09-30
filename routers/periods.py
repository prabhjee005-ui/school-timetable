from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException

from routers.schedule import find_slot_at, format_schedule_time, load_schedule_slots


router = APIRouter(tags=["Periods"])


@router.get("/current-period")
def get_current_period():
    """
    Return the currently active schedule slot based on Asia/Kolkata time.
    """
    now = datetime.now(tz=ZoneInfo("Asia/Kolkata"))
    slots = load_schedule_slots()

    if not slots:
        raise HTTPException(status_code=404, detail="No schedule found")

    slot = find_slot_at(slots, now.time())
    if slot:
        slot_type = slot["slot_type"]
        active_period = (
            slot["teaching_period_number"] if slot_type == "TEACHING" else None
        )
        response = {
            "current_time": now.strftime("%H:%M:%S"),
            "active_period": active_period,
            "start_time": format_schedule_time(slot["start_time"]),
            "end_time": format_schedule_time(slot["end_time"]),
            "slot_type": slot_type,
            "display_label": slot["display_label"],
        }
        return response

    return {
        "current_time": now.strftime("%H:%M:%S"),
        "active_period": None,
        "message": "No active period right now",
    }
