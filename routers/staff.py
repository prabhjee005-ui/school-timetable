"""Staff directory and allocation endpoints backed by the protected tables."""

import csv
import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator

from database import get_supabase_client

router = APIRouter(tags=["Staff"])
ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "allocation" / "out"
STAFF_COLUMNS = "id,staff_code,full_name,department,roles,email,notes,is_active,created_at"
ASSIGNMENT_COLUMNS = "id,staff_id,subject,target_type,sections,periods_per_week,raw_text,created_at"


@lru_cache(maxsize=1)
def allowed_sections() -> set[str]:
    path = OUT_DIR / "sections.csv"
    with path.open(newline="", encoding="utf-8-sig") as source:
        return {row["section"].strip() for row in csv.DictReader(source) if row.get("section", "").strip()}


def writes_enabled() -> bool:
    return os.getenv("STAFF_WRITE_ENABLED", "false").strip().casefold() in {"1", "true", "yes", "on"}


def require_staff_writes() -> None:
    if not writes_enabled():
        raise HTTPException(status_code=403, detail="Staff editing is disabled by STAFF_WRITE_ENABLED.")


def validate_sections(values: list[str]) -> list[str]:
    try:
        allowed = allowed_sections() | {"OPT11", "OPT12"}
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Allocation sections are unavailable.") from exc
    invalid = sorted(set(values) - allowed)
    if invalid:
        raise HTTPException(status_code=422, detail={"invalid_sections": invalid})
    return values


class StaffCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    staff_code: str = Field(min_length=1, max_length=32)
    full_name: str = Field(min_length=1, max_length=200)
    department: str | None = Field(default=None, max_length=120)
    roles: list[str] = Field(default_factory=list)
    email: str | None = Field(default=None, max_length=254)
    notes: str | None = Field(default=None, max_length=2000)


class StaffPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    staff_code: str | None = Field(default=None, min_length=1, max_length=32)
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    department: str | None = Field(default=None, max_length=120)
    roles: list[str] | None = None
    email: str | None = Field(default=None, max_length=254)
    notes: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None


class AssignmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject: str | None = Field(default=None, max_length=120)
    target_type: Literal["section", "combined_group", "optional_group", "unparsed"]
    sections: list[str] = Field(default_factory=list)
    periods_per_week: int | None = Field(default=None, ge=0, le=100)
    raw_text: str | None = Field(default=None, max_length=4000)

    @field_validator("sections")
    @classmethod
    def sections_are_known(cls, value: list[str]) -> list[str]:
        return validate_sections(value)


class AssignmentPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject: str | None = Field(default=None, max_length=120)
    target_type: Literal["section", "combined_group", "optional_group", "unparsed"] | None = None
    sections: list[str] | None = None
    periods_per_week: int | None = Field(default=None, ge=0, le=100)
    raw_text: str | None = Field(default=None, max_length=4000)

    @field_validator("sections")
    @classmethod
    def sections_are_known(cls, value: list[str] | None) -> list[str] | None:
        return validate_sections(value) if value is not None else None


def _require_staff(staff_id: str) -> dict:
    response = get_supabase_client().table("staff").select(STAFF_COLUMNS).eq("id", staff_id).limit(1).execute()
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Staff member not found.")
    return rows[0]


@router.get("/staff")
def list_staff(
    search: str = Query(default="", max_length=200),
    department: str = Query(default="", max_length=120),
    include_inactive: bool = False,
):
    supabase = get_supabase_client()
    query = supabase.table("staff").select(STAFF_COLUMNS).order("full_name")
    if not include_inactive:
        query = query.eq("is_active", True)
    rows = query.execute().data or []
    search_term = search.strip().casefold()
    department_term = department.strip().casefold()
    rows = [
        row for row in rows
        if (not search_term or search_term in (row.get("full_name") or "").casefold()
            or search_term in (row.get("staff_code") or "").casefold()
            or search_term in (row.get("email") or "").casefold())
        and (not department_term or department_term in (row.get("department") or "").casefold())
    ]
    assignments = supabase.table("assignments").select("staff_id").execute().data or []
    counts: dict[str, int] = {}
    for assignment in assignments:
        counts[assignment["staff_id"]] = counts.get(assignment["staff_id"], 0) + 1
    for row in rows:
        row["assignment_count"] = counts.get(row["id"], 0)
    return {"staff": rows, "write_enabled": writes_enabled()}


@router.get("/staff/issues")
def staff_issues():
    supabase = get_supabase_client()
    staff_rows = supabase.table("staff").select(STAFF_COLUMNS).order("full_name").execute().data or []
    assignment_rows = supabase.table("assignments").select(ASSIGNMENT_COLUMNS).execute().data or []
    with_assignments = {row["staff_id"] for row in assignment_rows}
    return {
        "staff_without_assignments": [row for row in staff_rows if row["id"] not in with_assignments],
        "unparsed_assignments": [row for row in assignment_rows if row.get("target_type") == "unparsed"],
    }


@router.get("/staff/{staff_id}")
def get_staff(staff_id: str):
    staff = _require_staff(staff_id)
    assignments = get_supabase_client().table("assignments").select(ASSIGNMENT_COLUMNS).eq("staff_id", staff_id).order("created_at").execute().data or []
    staff["assignments"] = assignments
    return {"staff": staff}


@router.post("/staff", status_code=201, dependencies=[Depends(require_staff_writes)])
def create_staff(payload: StaffCreate):
    # require admin role once auth exists
    response = get_supabase_client().table("staff").insert(payload.model_dump()).select(STAFF_COLUMNS).execute()
    return {"staff": (response.data or [None])[0]}


@router.patch("/staff/{staff_id}", dependencies=[Depends(require_staff_writes)])
def update_staff(staff_id: str, payload: StaffPatch):
    # require admin role once auth exists
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise HTTPException(status_code=422, detail="Provide at least one field to update.")
    response = get_supabase_client().table("staff").update(values).eq("id", staff_id).select(STAFF_COLUMNS).execute()
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Staff member not found.")
    return {"staff": rows[0]}


@router.delete("/staff/{staff_id}", dependencies=[Depends(require_staff_writes)])
def delete_staff(staff_id: str):
    # require admin role once auth exists
    response = get_supabase_client().table("staff").update({"is_active": False}).eq("id", staff_id).select("id,is_active").execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Staff member not found.")
    return {"staff": response.data[0]}


@router.post("/staff/{staff_id}/assignments", status_code=201, dependencies=[Depends(require_staff_writes)])
def create_assignment(staff_id: str, payload: AssignmentCreate):
    # require admin role once auth exists
    _require_staff(staff_id)
    values = payload.model_dump() | {"staff_id": staff_id}
    response = get_supabase_client().table("assignments").insert(values).select(ASSIGNMENT_COLUMNS).execute()
    return {"assignment": (response.data or [None])[0]}


@router.patch("/assignments/{assignment_id}", dependencies=[Depends(require_staff_writes)])
def update_assignment(assignment_id: str, payload: AssignmentPatch):
    # require admin role once auth exists
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise HTTPException(status_code=422, detail="Provide at least one field to update.")
    response = get_supabase_client().table("assignments").update(values).eq("id", assignment_id).select(ASSIGNMENT_COLUMNS).execute()
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    return {"assignment": rows[0]}


@router.delete("/assignments/{assignment_id}", dependencies=[Depends(require_staff_writes)])
def delete_assignment(assignment_id: str):
    # require admin role once auth exists
    response = get_supabase_client().table("assignments").delete().eq("id", assignment_id).select("id").execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    return {"deleted": True}


@router.get("/sections")
def get_sections():
    try:
        sections = sorted(allowed_sections())
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Allocation sections are unavailable.") from exc
    return {"sections": sections}
