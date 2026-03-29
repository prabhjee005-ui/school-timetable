from fastapi import APIRouter, HTTPException, Query

from database import get_supabase_client


router = APIRouter(tags=["Timetable"])


@router.get("/timetable")
def get_timetable(day: str = Query(...), period: int = Query(..., ge=1, le=8)):
    """
    Return all class timetable entries for a given day and period.
    """
    supabase = get_supabase_client()

    response = (
        supabase.table("timetable")
        .select("id,day,period_number,class_name,teacher_id,subject,room")
        .eq("day", day.title())
        .eq("period_number", period)
        .order("class_name")
        .execute()
    )

    return {"day": day, "period": period, "entries": response.data or []}


@router.get("/free-teachers")
def get_free_teachers(day: str = Query(...), period: int = Query(..., ge=1, le=8)):
    """
    Return teachers that are not teaching in the given day/period.
    """
    supabase = get_supabase_client()

    all_teachers = supabase.table("teachers").select("id,name,subjects,max_extra").execute()
    if not all_teachers.data:
        raise HTTPException(status_code=404, detail="No teachers found")

    busy_teachers = (
        supabase.table("timetable")
        .select("teacher_id")
        .eq("day", day.title())
        .eq("period_number", period)
        .execute()
    )

    busy_teacher_ids = {row["teacher_id"] for row in (busy_teachers.data or [])}

    free_teacher_list = [
        teacher for teacher in all_teachers.data if teacher["id"] not in busy_teacher_ids
    ]

    return {
        "day": day,
        "period": period,
        "busy_teacher_ids": list(busy_teacher_ids),
        "free_teachers": free_teacher_list,
    }
