from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Iterable, Optional, Any

import traceback

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

_LEAVE_ID_FIELDS: list[str] = ["id", "leave_request_id", "leave_id", "request_id"]
_STATUS_FIELDS: list[str] = [
    "status",
    "leave_status",
    "approval_status",
    "decision_status",
    "state",
    "approval_state",
]


def _get_first(row: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        if key in row:
            return row.get(key)
    return None


def _fetch_leave_request_by_id(supabase, id_value: Any) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    """
    Supabase schemas sometimes differ across projects; this helper tries a few common id column names.
    Returns (row, id_field_used).
    """
    for id_field in _LEAVE_ID_FIELDS:
        try:
            response = (
                supabase.table("leave_requests")
                .select("*")
                .eq(id_field, id_value)
                .execute()
            )
            if response.data:
                return response.data[0], id_field
        except Exception:
            # If the id column doesn't exist, Postgrest will raise; try next candidate.
            continue
    return None, None


def _detect_status_field(row: dict[str, Any]) -> Optional[str]:
    for status_field in _STATUS_FIELDS:
        if status_field in row:
            return status_field
    return None


def _update_leave_status(supabase, id_field: str, id_value: Any, status_field: str, new_status: str) -> None:
    supabase.table("leave_requests").update({status_field: new_status}).eq(id_field, id_value).execute()


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
        .select("*, teachers(name)")
        .order("created_at", desc=True)
        .execute()
    )
    rows = response.data or []

    # Flatten the joined teachers relationship into teacher_name for frontend convenience.
    for row in rows:
        teacher_rel = row.get("teachers")
        teacher_name = None
        if isinstance(teacher_rel, dict):
            teacher_name = teacher_rel.get("name")
        elif isinstance(teacher_rel, list) and teacher_rel:
            teacher_name = teacher_rel[0].get("name")

        row["teacher_name"] = teacher_name
        row.pop("teachers", None)

    return {"leave_requests": rows}


@router.post("/leave-requests/{leave_id}/approve")
def approve_leave(leave_id: str):
    """
    Approve a leave request and auto-find cover for all affected periods.
    """
    supabase = get_supabase_client()

    leave_request, id_field = _fetch_leave_request_by_id(supabase, id_value=leave_id)
    if not leave_request or not id_field:
        raise HTTPException(status_code=404, detail="Leave request not found")

    status_field = _detect_status_field(leave_request)
    if status_field and str(leave_request.get(status_field)).lower() != "pending":
        return {"message": "Leave request already processed", "leave_request": leave_request}

    teacher_id = _get_first(leave_request, ["teacher_id", "teacherId", "teacher"])
    from_date_raw = _get_first(leave_request, ["from_date", "fromDate", "from"])
    to_date_raw = _get_first(leave_request, ["to_date", "toDate", "to"])
    reason = _get_first(leave_request, ["reason", "leave_reason", "notes", "description"]) or ""

    if teacher_id is None or from_date_raw is None or to_date_raw is None:
        raise HTTPException(
            status_code=400,
            detail="Leave request record missing required fields (teacher_id/from_date/to_date).",
        )

    # Supabase often returns dates as strings.
    from_date = datetime.strptime(str(from_date_raw), "%Y-%m-%d").date()
    to_date = datetime.strptime(str(to_date_raw), "%Y-%m-%d").date()

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
                        teacher_id=str(teacher_id),
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

        if not status_field:
            raise HTTPException(status_code=500, detail="Cannot update leave status: status field not found.")

        _update_leave_status(
            supabase,
            id_field=id_field,
            id_value=leave_id,
            status_field=status_field,
            new_status="approved",
        )
        return {"message": "Leave request approved", "leave_request_id": leave_id}
    except Exception as e:
        # Leave remains pending so the principal can retry later.
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Approval failed: {e}") from e


@router.post("/leave-requests/{leave_id}/reject")
def reject_leave(leave_id: str):
    """
    Reject a leave request.
    """
    supabase = get_supabase_client()
    leave_request, id_field = _fetch_leave_request_by_id(supabase, id_value=leave_id)
    if not leave_request or not id_field:
        raise HTTPException(status_code=404, detail="Leave request not found")

    status_field = _detect_status_field(leave_request)
    if status_field and str(leave_request.get(status_field)).lower() != "pending":
        return {"message": "Leave request already processed", "leave_request": leave_request}

    try:
        if not status_field:
            raise HTTPException(status_code=500, detail="Cannot update leave status: status field not found.")
        _update_leave_status(
            supabase,
            id_field=id_field,
            id_value=leave_id,
            status_field=status_field,
            new_status="rejected",
        )
        return {"message": "Leave request rejected", "leave_request_id": leave_id}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Reject failed: {e}") from e

