from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any
from database import get_supabase_client

router = APIRouter(tags=["AI Settings"])

class AISettingsUpdate(BaseModel):
    value: dict[str, Any]

@router.get("/ai-settings/{setting_id}")
def get_ai_setting(setting_id: str):
    supabase = get_supabase_client()
    response = supabase.table("ai_settings").select("value").eq("id", setting_id).execute()
    if not response.data:
        # Return default if not found
        if setting_id == "ai_config":
            return {"prefer_subject_match": True, "avoid_double_assignments": True, "max_extra_periods": 3}
        raise HTTPException(status_code=404, detail="AI Setting not found")
    return response.data[0]["value"]

@router.post("/ai-settings/{setting_id}")
def update_ai_setting(setting_id: str, payload: AISettingsUpdate):
    supabase = get_supabase_client()
    response = (
        supabase.table("ai_settings")
        .upsert({"id": setting_id, "value": payload.value})
        .execute()
    )
    return {"message": f"AI Setting {setting_id} updated", "data": response.data}
