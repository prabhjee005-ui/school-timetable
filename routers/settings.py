from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any
from database import get_supabase_client

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
            return {"school_name": "My School", "num_periods": 8, "recess_after_period": 4, "class_names": ["6A", "6B", "7A", "7B", "8A", "8B", "9A", "9B", "10A", "10B"]}
        raise HTTPException(status_code=404, detail="Setting not found")
    return response.data[0]["value"]

@router.post("/settings/{setting_id}")
def update_setting(setting_id: str, payload: SettingsUpdate):
    supabase = get_supabase_client()
    response = (
        supabase.table("settings")
        .upsert({"id": setting_id, "value": payload.value})
        .execute()
    )
    return {"message": f"Setting {setting_id} updated", "data": response.data}
