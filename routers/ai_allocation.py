import json
from datetime import datetime, timedelta
from typing import Any

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from database import get_groq_api_key, get_supabase_client


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


def _get_json_from_groq(prompt: str) -> dict[str, Any]:
    api_key = get_groq_api_key()
    payload = {
        "model": "llama-3.3-70b-versatile",
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a strict school timetable allocator. "
                    "Return ONLY valid JSON with keys: assigned_teacher_id (string), reason (string)."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    response = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        json=payload,
        headers=headers,
        timeout=30,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"].strip()
    if content.startswith("```json"):
        content = content[7:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()


    try:
        return json.loads(content)
    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Groq returned non-JSON response: {content}",
        ) from error


@router.post("/find-covering-teacher")
def find_covering_teacher(payload: CoveringTeacherRequest):
    """
    Pick the best free teacher for a class using constraints + Groq reasoning.
    """
    supabase = get_supabase_client()
    week_start = _get_week_start(payload.date)

    all_teachers_response = (
        supabase.table("teachers")
        .select("id,name,subjects,max_extra")
        .eq("role", "teacher")
        .order("id")
        .execute()
    )
    all_teachers = all_teachers_response.data or []
    if not all_teachers:
        raise HTTPException(status_code=404, detail="No teachers found")

    busy_response = (
        supabase.table("timetable")
        .select("teacher_id,class_name,subject")
        .eq("day", payload.day)
        .eq("period_number", payload.period_number)
        .execute()
    )
    busy_teacher_ids = {row["teacher_id"] for row in (busy_response.data or [])}

    free_teachers = [t for t in all_teachers if t["id"] not in busy_teacher_ids]
    if not free_teachers:
        raise HTTPException(status_code=400, detail="No free teachers available")

    subject_matched = [
        teacher
        for teacher in free_teachers
        if payload.subject in (teacher.get("subjects") or [])
    ]

    tracker_response = (
        supabase.table("extra_period_tracker")
        .select("teacher_id,extra_count")
        .eq("week_start", week_start)
        .execute()
    )
    extra_map = {row["teacher_id"]: row["extra_count"] for row in (tracker_response.data or [])}

    eligible_teachers = []
    for teacher in free_teachers:
        used = extra_map.get(teacher["id"], 0)
        limit = _teacher_extra_limit(teacher)
        if used < limit:
            eligible_teachers.append(
                {
                    "id": teacher["id"],
                    "name": teacher["name"],
                    "subjects": teacher.get("subjects") or [],
                    "extra_used_this_week": used,
                    "extra_limit": limit,
                    "subject_match": payload.subject in (teacher.get("subjects") or []),
                }
            )

    if not eligible_teachers:
        raise HTTPException(status_code=400, detail="No eligible teachers under extra-period limits")

    prompt = f"""
School: Delhi Public School (Demo)
Need to assign a covering teacher for:
- day: {payload.day}
- date: {payload.date}
- class: {payload.class_name}
- period_number: {payload.period_number}
- subject: {payload.subject}
- room: {payload.room}
- original_teacher_id: {payload.original_teacher_id}

Busy teacher IDs this period:
{sorted(list(busy_teacher_ids))}

Teachers who are free this period and eligible by max extra rules:
{json.dumps(eligible_teachers, indent=2)}

Teachers with subject match ({payload.subject}):
{json.dumps([t for t in eligible_teachers if t["subject_match"]], indent=2)}

Rules:
1) Must choose from eligible teachers list only.
2) Strongly prefer subject match.
3) Prefer teacher with lower extra_used_this_week.
4) Return only JSON: {{"assigned_teacher_id": "T01", "reason": "string"}}
""".strip()

    groq_result = _get_json_from_groq(prompt)
    assigned_teacher_id = groq_result.get("assigned_teacher_id")
    # if it's a string that is a number, cast it
    if isinstance(assigned_teacher_id, str) and assigned_teacher_id.isdigit():
        assigned_teacher_id = int(assigned_teacher_id)
        
    reason = groq_result.get("reason", "")

    eligible_ids = {teacher["id"] for teacher in eligible_teachers}
    if assigned_teacher_id not in eligible_ids:
        raise HTTPException(
            status_code=502,
            detail="Groq selected an invalid teacher not in eligible list",
        )

    return {
        "assigned_teacher_id": assigned_teacher_id,
        "reason": reason,
        "eligible_teachers": eligible_teachers,
        "subject_matched_teacher_ids": [t["id"] for t in subject_matched],
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
