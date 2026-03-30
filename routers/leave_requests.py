from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Iterable

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from database import get_supabase_client
from routers.ai_allocation import (
    AdjustmentCreate,
    CoveringTeacherRequest,
    create_adjustment,
    find_covering_teacher,
)


router = APIRouter(tags=["Leave Requests"])


class LeaveRequestCreate(BaseModel):
    teacher_id: str
    from_date: date = Field(..., description="Date in YYYY-MM-DD format")
    to_date: date = Field(..., description="Date in YYYY-MM-DD format")
    reason: str


def _iter_dates_inclusive(from_date: date, to_date: date) -> Iterable[date]:
    current = from_date
    while current <= to_date:
        yield current
        current += timedelta(days=1)


def _day_name(d: date) -> str:
    # Python: Monday=0 ... Sunday=6
    names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    return names[d.weekday()]


def _ensure_absence(
    supabase,
    *,
    teacher_id: str,
    absence_date: str,
    period_number: int,
    reason: str,
) -> None:
    existing = (
        supabase.table("absences")
        .select("id")
        .eq("teacher_id", teacher_id)
        .eq("date", absence_date)
        .eq("period_number", period_number)
        .execute()
    )

    if existing.data:
        return

    supabase.table("absences").insert(
        {
            "teacher_id": teacher_id,
            "date": absence_date,
            "period_number": period_number,
            "reason": reason,
        }
    ).execute()


@router.post("/leave-requests")
def create_leave_request(payload: LeaveRequestCreate):
    """
    Teacher submits a leave request.
    """
    if payload.from_date > payload.to_date:
        raise HTTPException(status_code=400, detail="from_date must be <= to_date")

    supabase = get_supabase_client()

    insert_payload = payload.model_dump()
    insert_payload["from_date"] = payload.from_date.isoformat()
    insert_payload["to_date"] = payload.to_date.isoformat()
    insert_payload["status"] = "pending"

    insert_response = supabase.table("leave_requests").insert(insert_payload).execute()
    inserted = (insert_response.data or [None])[0]

    return {
        "message": "Leave request submitted",
        "leave_request": inserted,
    }


@router.get("/leave-requests")
def get_leave_requests():
    """
    Get all leave requests.
    """
    supabase = get_supabase_client()
    response = (
        supabase.table("leave_requests")
        .select("*")
        .order("created_at", desc=True)
        .execute()
    )
    return {"leave_requests": response.data or []}


@router.post("/leave-requests/{id}/approve")
def approve_leave_request(id: int):
    """
    Approve a leave request and auto-find cover for all affected periods.
    """
    supabase = get_supabase_client()

    leave_response = (
        supabase.table("leave_requests")
        .select("*")
        .eq("id", id)
        .execute()
    )
    if not leave_response.data:
        raise HTTPException(status_code=404, detail="Leave request not found")

    leave_request = leave_response.data[0]
    if leave_request.get("status") != "pending":
        return {"message": "Leave request already processed", "leave_request": leave_request}

    teacher_id = leave_request["teacher_id"]
    from_date = datetime.strptime(leave_request["from_date"], "%Y-%m-%d").date()
    to_date = datetime.strptime(leave_request["to_date"], "%Y-%m-%d").date()
    reason = leave_request.get("reason") or ""

    try:
        for d in _iter_dates_inclusive(from_date, to_date):
            absence_date = d.isoformat()
            day_name = _day_name(d)

            # Find all periods/classes where this teacher is scheduled on each day.
            timetable_response = (
                supabase.table("timetable")
                .select("period_number,class_name,subject,room")
                .eq("day", day_name)
                .eq("teacher_id", teacher_id)
                .order("period_number")
                .execute()
            )
            timetable_rows = timetable_response.data or []
            if not timetable_rows:
                continue

            # Insert one absence row per teacher per period (even if they teach multiple classes).
            inserted_periods: set[int] = set()
            for row in timetable_rows:
                period_number = row["period_number"]
                if period_number not in inserted_periods:
                    _ensure_absence(
                        supabase,
                        teacher_id=teacher_id,
                        absence_date=absence_date,
                        period_number=period_number,
                        reason=reason,
                    )
                    inserted_periods.add(period_number)

            # For each class entry, find a free covering teacher and create an adjustment.
            for row in timetable_rows:
                period_number = row["period_number"]
                covering = find_covering_teacher(
                    CoveringTeacherRequest(
                        day=day_name,
                        date=absence_date,
                        period_number=period_number,
                        class_name=row["class_name"],
                        subject=row["subject"],
                        room=row["room"],
                        original_teacher_id=str(teacher_id),
                    )
                )

                assigned_teacher_id = covering["assigned_teacher_id"]
                ai_reason = covering.get("reason") or ""

                create_adjustment(
                    AdjustmentCreate(
                        date=absence_date,
                        period_number=period_number,
                        class_name=row["class_name"],
                        original_teacher_id=str(teacher_id),
                        covering_teacher_id=str(assigned_teacher_id),
                        subject=row["subject"],
                        room=row["room"],
                        ai_reasoning=ai_reason,
                    )
                )

        supabase.table("leave_requests").update({"status": "approved"}).eq("id", id).execute()
        return {"message": "Leave request approved", "leave_request_id": id}
    except Exception as e:
        # Leave remains pending so the principal can retry later.
        raise HTTPException(status_code=400, detail=f"Approval failed: {e}") from e


@router.post("/leave-requests/{id}/reject")
def reject_leave_request(id: int):
    """
    Reject a leave request.
    """
    supabase = get_supabase_client()

    leave_response = (
        supabase.table("leave_requests")
        .select("*")
        .eq("id", id)
        .execute()
    )
    if not leave_response.data:
        raise HTTPException(status_code=404, detail="Leave request not found")

    leave_request = leave_response.data[0]
    if leave_request.get("status") != "pending":
        return {"message": "Leave request already processed", "leave_request": leave_request}

    supabase.table("leave_requests").update({"status": "rejected"}).eq("id", id).execute()
    return {"message": "Leave request rejected", "leave_request_id": id}

