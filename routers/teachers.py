from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException

from database import get_supabase_client


router = APIRouter(tags=["Teachers"])
TEACHER_RESPONSE_COLUMNS = "id,name,subjects,phone,max_extra,created_at,email,role"


def _strip_password_hash(row: dict) -> dict:
    row.pop("password_hash", None)
    return row


class TeacherCreate(BaseModel):
    id: str = Field(..., description="Teacher ID (e.g. T11)")
    name: str
    role: str = "teacher"
    subjects: list[str] = []
    max_extra: int = 3

class TeacherUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    subjects: list[str] | None = None
    max_extra: int | None = None

@router.get("/teachers")
def get_all_teachers():
    supabase = get_supabase_client()
    response = supabase.table("teachers").select(TEACHER_RESPONSE_COLUMNS).eq("role", "teacher").order("id").execute()
    return {"teachers": [_strip_password_hash(row) for row in response.data or []]}

@router.post("/teachers")
def add_teacher(payload: TeacherCreate):
    raise HTTPException(status_code=410, detail="Use the staff directory endpoint to manage staff.")

@router.put("/teachers/{teacher_id}")
def update_teacher(teacher_id: str, payload: TeacherUpdate):
    raise HTTPException(status_code=410, detail="Use the staff directory endpoint to manage staff.")

@router.delete("/teachers/{teacher_id}")
def delete_teacher(teacher_id: str):
    raise HTTPException(status_code=410, detail="Use the staff directory endpoint to deactivate staff.")


@router.get("/teachers/verify/{teacher_id}")
def verify_teacher(teacher_id: str):
    supabase = get_supabase_client()

    response = supabase.table("teachers").select("name, role").eq("id", teacher_id).eq("role", "teacher").execute()
    rows = response.data or []

    if not rows:
        return {"valid": False, "message": "Teacher ID not found"}

    teacher = rows[0]
    role = (teacher.get("role") or "").lower()

    if role != "teacher":
        return {"valid": False, "message": "Invalid role"}

    return {"valid": True, "name": teacher.get("name") or teacher_id}
