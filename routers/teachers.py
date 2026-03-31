from __future__ import annotations

from fastapi import APIRouter

from database import get_supabase_client


router = APIRouter(tags=["Teachers"])


@router.get("/teachers/verify/{teacher_id}")
def verify_teacher(teacher_id: str):
    supabase = get_supabase_client()

    response = supabase.table("teachers").select("name, role").eq("id", teacher_id).execute()
    rows = response.data or []

    if not rows:
        return {"valid": False, "message": "Teacher ID not found"}

    teacher = rows[0]
    role = (teacher.get("role") or "").lower()

    if role != "teacher":
        return {"valid": False, "message": "Invalid role"}

    return {"valid": True, "name": teacher.get("name") or teacher_id}

