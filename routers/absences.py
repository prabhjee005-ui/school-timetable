from pydantic import BaseModel, Field
from fastapi import APIRouter

from database import get_supabase_client


router = APIRouter(tags=["Absences"])


class AbsenceCreate(BaseModel):
    teacher_id: int
    date: str = Field(..., description="Date in YYYY-MM-DD format")
    period_number: int = Field(..., ge=1, le=8)
    reason: str


@router.post("/absences")
def create_absence(payload: AbsenceCreate):
    """
    Mark a teacher absent for a date and period.
    """
    supabase = get_supabase_client()

    insert_response = (
        supabase.table("absences")
        .insert(payload.model_dump())
        .execute()
    )

    return {
        "message": "Absence marked successfully",
        "absence": (insert_response.data or [None])[0],
    }
