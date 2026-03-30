from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from database import get_supabase_client


router = APIRouter(prefix="/auth", tags=["Auth"])


class LoginPayload(BaseModel):
    teacher_id: str = Field(..., description="Teacher ID, e.g. T01")
    password: str = Field(..., description="Password")


@router.post("/login")
def login(payload: LoginPayload):
    # Hardcoded password for now (per request).
    if payload.password != "password123":
        raise HTTPException(status_code=401, detail="Invalid credentials")

    supabase = get_supabase_client()
    teacher_resp = (
        supabase.table("teachers")
        .select("id,name,role")
        .eq("id", payload.teacher_id)
        .execute()
    )
    teacher_rows = teacher_resp.data or []
    if not teacher_rows:
        raise HTTPException(status_code=404, detail="Teacher not found")

    teacher = teacher_rows[0]
    return {
        "teacher_id": teacher.get("id", payload.teacher_id),
        "name": teacher.get("name", ""),
        "role": teacher.get("role", "teacher"),
    }

