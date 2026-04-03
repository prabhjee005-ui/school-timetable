from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException

from database import get_supabase_client


router = APIRouter(tags=["Teachers"])

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
    response = supabase.table("teachers").select("*").order("id").execute()
    return {"teachers": response.data or []}

@router.post("/teachers")
def add_teacher(payload: TeacherCreate):
    supabase = get_supabase_client()
    # Check if ID exists
    check = supabase.table("teachers").select("id").eq("id", payload.id).execute()
    if check.data:
        raise HTTPException(status_code=400, detail=f"Teacher ID {payload.id} already exists")
    
    response = supabase.table("teachers").insert(payload.model_dump()).execute()
    return {"message": "Teacher added", "teacher": response.data[0]}

@router.put("/teachers/{teacher_id}")
def update_teacher(teacher_id: str, payload: TeacherUpdate):
    supabase = get_supabase_client()
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    response = supabase.table("teachers").update(update_data).eq("id", teacher_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return {"message": "Teacher updated", "teacher": response.data[0]}

@router.delete("/teachers/{teacher_id}")
def delete_teacher(teacher_id: str):
    supabase = get_supabase_client()
    response = supabase.table("teachers").delete().eq("id", teacher_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return {"message": "Teacher deleted"}


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

