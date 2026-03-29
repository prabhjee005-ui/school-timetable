from datetime import datetime

from fastapi import APIRouter, HTTPException

from database import get_supabase_client


router = APIRouter(tags=["Periods"])


@router.get("/current-period")
def get_current_period():
    """
    Return the currently active period based on local server time.
    """
    supabase = get_supabase_client()
    now_time = datetime.now().time()

    response = (
        supabase.table("periods")
        .select("period_number,start_time,end_time")
        .order("period_number")
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="No periods found")

    for period in response.data:
        start_time = datetime.strptime(period["start_time"], "%H:%M:%S").time()
        end_time = datetime.strptime(period["end_time"], "%H:%M:%S").time()
        if start_time <= now_time <= end_time:
            return {
                "current_time": now_time.strftime("%H:%M:%S"),
                "active_period": period["period_number"],
                "start_time": period["start_time"],
                "end_time": period["end_time"],
            }

    return {
        "current_time": now_time.strftime("%H:%M:%S"),
        "active_period": None,
        "message": "No active period right now",
    }
