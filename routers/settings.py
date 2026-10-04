from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any
from database import get_supabase_client
from routers.schedule import get_school_year

router = APIRouter(tags=["Settings"])

class SettingsUpdate(BaseModel):
    value: dict[str, Any]

@router.get("/settings/{setting_id}")
def get_setting(setting_id: str):
    supabase = get_supabase_client()
    response = supabase.table("settings").select("value").eq("id", setting_id).execute()
    if not response.data:
        # Return default school_config
        if setting_id == "school_config":
            return {"school_name": "My School", "num_periods": 9, "recess_after_period": None, "class_names": []}
        raise HTTPException(status_code=404, detail="Setting not found")
    return response.data[0]["value"]

@router.post("/settings/{setting_id}")
def update_setting(setting_id: str, payload: SettingsUpdate):
    supabase = get_supabase_client()
    if setting_id == "school_config":
        slots = (
            supabase.table("bell_schedule_slots")
            .select("teaching_period_number")
            .eq("school_year", get_school_year())
            .eq("slot_type", "TEACHING")
            .execute()
            .data
            or []
        )
        expected_periods = len(slots)
        if expected_periods and payload.value.get("num_periods") != expected_periods:
            raise HTTPException(status_code=422, detail=f"num_periods must match the bell schedule ({expected_periods})")
    response = (
        supabase.table("settings")
        .upsert({"id": setting_id, "value": payload.value})
        .execute()
    )
    return {"message": f"Setting {setting_id} updated", "data": response.data}
