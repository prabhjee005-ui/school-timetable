import re
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from database import get_supabase_client


router = APIRouter(tags=["AI Allocation"])


class CoveringTeacherRequest(BaseModel):
    day: str
    date: str = Field(..., description="Date in YYYY-MM-DD format")
    period_number: int = Field(..., ge=1, le=8)
    class_name: str
    subject: str
    room: str
    original_teacher_id: str


class AdjustmentCreate(BaseModel):
    date: str = Field(..., description="Date in YYYY-MM-DD format")
    period_number: int = Field(..., ge=1, le=8)
    class_name: str
    original_teacher_id: str
    covering_teacher_id: str
    subject: str
    room: str
    ai_reasoning: str


def _get_week_start(input_date: str) -> str:
    parsed_date = datetime.strptime(input_date, "%Y-%m-%d").date()
    week_start = parsed_date - timedelta(days=parsed_date.weekday())
    return week_start.isoformat()


def _teacher_extra_limit(teacher: dict[str, Any], *, default_if_null: int = 3) -> int:
    raw = teacher.get("max_extra")
    if raw is None:
        return default_if_null
    return int(raw)

def _parse_class_number(class_name: str) -> int | None:
    """
    Extract the first integer from class labels like "10A", "5", or "Class 7".
    """
    if not class_name:
        return None
    match = re.search(r"\d+", str(class_name))
    if not match:
        return None
    return int(match.group(0))


def _tier_for_class_number(class_number: int) -> str | None:
    if 1 <= class_number <= 5:
        return "primary"
    if 6 <= class_number <= 8:
        return "middle"
    if 9 <= class_number <= 12:
        return "secondary"
    return None


def _tier_for_class_name(class_name: str) -> str:
    parsed = _parse_class_number(class_name)
    if parsed is None:
        raise HTTPException(status_code=400, detail=f"Invalid class_name: {class_name}")
    tier = _tier_for_class_number(parsed)
    if tier is None:
        raise HTTPException(status_code=400, detail=f"Class out of supported range: {class_name}")
    return tier


@router.post("/find-covering-teacher")
def find_covering_teacher(payload: CoveringTeacherRequest):
    """
    Pick the best free teacher for a class using tier constraints + fairness.
    """
    supabase = get_supabase_client()
    week_start = _get_week_start(payload.date)

    target_tier = _tier_for_class_name(payload.class_name)

    all_teachers_response = (
        supabase.table("teachers")
        .select("id,name,max_extra")
        .eq("role", "teacher")
        .order("id")
        .execute()
    )
    all_teachers = all_teachers_response.data or []
    if not all_teachers:
        raise HTTPException(status_code=404, detail="No teachers found")

    busy_response = (
        supabase.table("timetable")
        .select("teacher_id")
        .eq("day", payload.day)
        .eq("period_number", payload.period_number)
        .execute()
    )
    busy_teacher_ids = {row["teacher_id"] for row in (busy_response.data or [])}

    free_teachers = [t for t in all_teachers if t["id"] not in busy_teacher_ids]
    if not free_teachers:
        raise HTTPException(status_code=400, detail="No free teachers available")

    free_teacher_ids = [t["id"] for t in free_teachers]
    teacher_tiers: dict[str, set[str]] = {}
    if free_teacher_ids:
        teacher_class_rows = (
            supabase.table("timetable")
            .select("teacher_id,class_name")
            .in_("teacher_id", free_teacher_ids)
            .execute()
        )
        for row in (teacher_class_rows.data or []):
            t_id = row.get("teacher_id")
            if not t_id:
                continue
            tier_set = teacher_tiers.setdefault(str(t_id), set())
            class_name = row.get("class_name")
            class_number = _parse_class_number(class_name)
            tier = _tier_for_class_number(class_number) if class_number is not None else None
            if tier:
                tier_set.add(tier)

    tier_eligible_teachers = [
        t for t in free_teachers if target_tier in teacher_tiers.get(str(t["id"]), set())
    ]
    if not tier_eligible_teachers:
        raise HTTPException(
            status_code=400,
            detail="No eligible teachers for the required class tier",
        )

    tracker_response = (
        supabase.table("extra_period_tracker")
        .select("teacher_id,extra_count")
        .eq("week_start", week_start)
        .execute()
    )
    extra_map = {row["teacher_id"]: row["extra_count"] for row in (tracker_response.data or [])}

    eligible_teachers: list[dict[str, Any]] = []
    for teacher in tier_eligible_teachers:
        used = extra_map.get(teacher["id"], 0)
        limit = _teacher_extra_limit(teacher)
        if used < limit:
            eligible_teachers.append(
                {
                    "id": teacher["id"],
                    "name": teacher["name"],
                    "extra_used_this_week": used,
                    "extra_limit": limit,
                }
            )

    if not eligible_teachers:
        raise HTTPException(status_code=400, detail="No eligible teachers under extra-period limits")

    eligible_teachers.sort(key=lambda t: (t["extra_used_this_week"], str(t["id"])))
    assigned = eligible_teachers[0]

    reason = (
        f"Fairness: selected teacher with the lowest extra_count this week "
        f"({assigned['extra_used_this_week']}/{assigned['extra_limit']}) "
        f"for tier '{target_tier}'."
    )

    return {
        "assigned_teacher_id": assigned["id"],
        "reason": reason,
        "eligible_teachers": eligible_teachers,
        "week_start": week_start,
    }


@router.post("/create-adjustment")
def create_adjustment(payload: AdjustmentCreate):
    """
    Save AI allocation decision into adjustments table.
    """
    supabase = get_supabase_client()
    week_start = _get_week_start(payload.date)

    try:
        adjustment_insert = (
            supabase.table("adjustments")
            .insert(payload.model_dump())
            .execute()
        )
        inserted_adjustment = (adjustment_insert.data or [None])[0]

        existing_tracker = (
            supabase.table("extra_period_tracker")
            .select("teacher_id,week_start,extra_count")
            .eq("teacher_id", payload.covering_teacher_id)
            .eq("week_start", week_start)
            .execute()
        )

        if existing_tracker.data:
            current_count = existing_tracker.data[0]["extra_count"]
            (
                supabase.table("extra_period_tracker")
                .update({"extra_count": current_count + 1})
                .eq("teacher_id", payload.covering_teacher_id)
                .eq("week_start", week_start)
                .execute()
            )
        else:
            (
                supabase.table("extra_period_tracker")
                .insert(
                    {
                        "teacher_id": payload.covering_teacher_id,
                        "week_start": week_start,
                        "extra_count": 1,
                    }
                )
                .execute()
            )

        return {
            "message": "Adjustment saved and extra period count updated",
            "adjustment": inserted_adjustment,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/adjustments/today")
def get_todays_adjustments(query_date: str = None):
    """
    Get all AI adjustments for today (or a specified date).
    """
    if not query_date:
        query_date = datetime.now().date().isoformat()
        
    supabase = get_supabase_client()
    try:
        response = (
            supabase.table("adjustments")
            .select("*")
            .eq("date", query_date)
            .order("period_number")
            .execute()
        )
        adjustments = response.data or []

        # Enrich with teacher names for the frontend.
        teachers_response = supabase.table("teachers").select("id,name").execute()
        teachers = teachers_response.data or []
        teacher_map = {t.get("id"): t.get("name") for t in teachers}

        for row in adjustments:
            covering_teacher_id = row.get("covering_teacher_id")
            row["covering_teacher_name"] = teacher_map.get(covering_teacher_id)

        return {"adjustments": adjustments}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/adjustments/{adjustment_id}")
def delete_adjustment(adjustment_id: int):
    """
    Delete an existing AI adjustment.
    """
    supabase = get_supabase_client()
    try:
        response = (
            supabase.table("adjustments")
            .delete()
            .eq("id", adjustment_id)
            .execute()
        )
        if not response.data:
            raise HTTPException(status_code=404, detail="Adjustment not found")
        return {"message": "Adjustment deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
