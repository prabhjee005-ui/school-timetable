from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import PurePath
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from database import get_supabase_client


router = APIRouter(prefix="/chat", tags=["Staff Chat"])
bearer = HTTPBearer(auto_error=False)
ATTACHMENT_BUCKET = "chat-attachments"
MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024
MAX_CONVERSATION_MEMBERS = 50
ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
}


@dataclass(frozen=True)
class ChatActor:
    auth_user_id: str
    staff_id: str
    is_admin: bool


class ConversationCreate(BaseModel):
    kind: Literal["direct", "group"]
    member_staff_ids: list[str] = Field(default_factory=list)
    name: str | None = Field(default=None, max_length=80)


def _required_text(value: str | None, name: str, maximum: int) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise HTTPException(status_code=422, detail=f"{name} is required")
    if len(cleaned) > maximum:
        raise HTTPException(status_code=422, detail=f"{name} is too long")
    return cleaned


def get_chat_actor(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> ChatActor:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Sign in to use staff chat")

    supabase = get_supabase_client()
    try:
        user_response = supabase.auth.get_user(credentials.credentials)
        auth_user = getattr(user_response, "user", None)
        if auth_user is None and isinstance(user_response, dict):
            auth_user = user_response.get("user")
        auth_user_id = getattr(auth_user, "id", None)
        if auth_user_id is None and isinstance(auth_user, dict):
            auth_user_id = auth_user.get("id")
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Your sign-in has expired") from exc

    if not auth_user_id:
        raise HTTPException(status_code=401, detail="Your sign-in is invalid")

    profiles = (
        supabase.table("chat_profiles")
        .select("auth_user_id,staff_id,is_active,is_admin")
        .eq("auth_user_id", str(auth_user_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not profiles or not profiles[0].get("is_active", True):
        raise HTTPException(status_code=403, detail="This account is not linked to an active staff member")

    profile = profiles[0]
    active_staff = (
        supabase.table("staff")
        .select("id")
        .eq("id", str(profile["staff_id"]))
        .eq("is_active", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not active_staff:
        raise HTTPException(status_code=403, detail="This staff account is inactive")
    return ChatActor(
        auth_user_id=str(auth_user_id),
        staff_id=str(profile["staff_id"]),
        is_admin=bool(profile.get("is_admin", False)),
    )


def _require_member(supabase, conversation_id: str, actor: ChatActor) -> dict:
    rows = (
        supabase.table("chat_conversation_members")
        .select("conversation_id,staff_id,member_role,last_read_at")
        .eq("conversation_id", conversation_id)
        .eq("staff_id", actor.staff_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        # Do not disclose whether a conversation exists to non-members.
        raise HTTPException(status_code=404, detail="Conversation not found")
    return rows[0]


def _staff_directory_rows(supabase, staff_ids: list[str] | None = None) -> list[dict]:
    query = (
        supabase.table("staff")
        .select("id,staff_code,full_name,department,roles")
        .eq("is_active", True)
        .order("full_name")
        .limit(500)
    )
    if staff_ids is not None:
        if not staff_ids:
            return []
        query = query.in_("id", staff_ids)
    return query.execute().data or []


@router.get("/me")
def get_chat_me(actor: ChatActor = Depends(get_chat_actor)):
    staff = _staff_directory_rows(get_supabase_client(), [actor.staff_id])
    if not staff:
        raise HTTPException(status_code=403, detail="Your linked staff account is inactive")
    return {"staff": staff[0], "is_admin": actor.is_admin}


@router.get("/staff")
def search_chat_staff(
    search: str = Query(default="", max_length=80),
    actor: ChatActor = Depends(get_chat_actor),
):
    supabase = get_supabase_client()
    needle = search.strip().casefold()
    rows = _staff_directory_rows(supabase)
    if needle:
        rows = [
            row for row in rows
            if needle in str(row.get("full_name") or "").casefold()
            or needle in str(row.get("staff_code") or "").casefold()
            or needle in str(row.get("department") or "").casefold()
        ]
    return {"staff": [row for row in rows if row["id"] != actor.staff_id][:100]}


@router.get("/conversations")
def list_conversations(actor: ChatActor = Depends(get_chat_actor)):
    supabase = get_supabase_client()
    own_memberships = (
        supabase.table("chat_conversation_members")
        .select("conversation_id,unread_count")
        .eq("staff_id", actor.staff_id)
        .execute()
        .data
        or []
    )
    conversation_ids = list(dict.fromkeys(row["conversation_id"] for row in own_memberships))
    if not conversation_ids:
        return {"conversations": []}
    unread_counts = {row["conversation_id"]: int(row.get("unread_count", 0)) for row in own_memberships}

    conversations = (
        supabase.table("chat_conversations")
        .select("id,kind,name,created_by,created_at,last_message_at,last_message_preview,last_message_sender_staff_id")
        .in_("id", conversation_ids)
        .order("last_message_at", desc=True)
        .execute()
        .data
        or []
    )
    members = (
        supabase.table("chat_conversation_members")
        .select("conversation_id,staff_id,member_role")
        .in_("conversation_id", conversation_ids)
        .execute()
        .data
        or []
    )
    staff_ids = list(dict.fromkeys(row["staff_id"] for row in members))
    staff_by_id = {row["id"]: row for row in _staff_directory_rows(supabase, staff_ids)}
    members_by_conversation: dict[str, list[dict]] = {}
    for row in members:
        staff = staff_by_id.get(row["staff_id"])
        if staff:
            members_by_conversation.setdefault(row["conversation_id"], []).append(
                {"staff": staff, "member_role": row["member_role"]}
            )
    result = []
    for conversation in conversations:
        conversation_id = conversation["id"]
        peers = members_by_conversation.get(conversation_id, [])
        if conversation["kind"] == "direct":
            peer_names = [
                member["staff"]["full_name"]
                for member in peers
                if member["staff"]["id"] != actor.staff_id
            ]
            display_name = peer_names[0] if peer_names else "Direct conversation"
        else:
            display_name = conversation.get("name") or "Group chat"

        result.append({
            **conversation,
            "display_name": display_name,
            "members": peers,
            "last_message": {
                "body": conversation.get("last_message_preview") or "",
                "sender_staff_id": conversation.get("last_message_sender_staff_id"),
                "created_at": conversation.get("last_message_at"),
            } if conversation.get("last_message_sender_staff_id") else None,
            "unread_count": unread_counts.get(conversation_id, 0),
        })
    return {"conversations": result}


@router.post("/conversations")
def create_conversation(payload: ConversationCreate, actor: ChatActor = Depends(get_chat_actor)):
    supabase = get_supabase_client()
    requested = list(dict.fromkeys(str(member_id) for member_id in payload.member_staff_ids))
    if actor.staff_id not in requested:
        requested.append(actor.staff_id)
    if payload.kind == "direct" and len(requested) != 2:
        raise HTTPException(status_code=422, detail="A direct conversation has exactly two staff members")
    if payload.kind == "group" and not 2 <= len(requested) <= MAX_CONVERSATION_MEMBERS:
        raise HTTPException(status_code=422, detail=f"A group must have between 2 and {MAX_CONVERSATION_MEMBERS} members")

    active_staff = _staff_directory_rows(supabase, requested)
    if len(active_staff) != len(requested):
        raise HTTPException(status_code=422, detail="One or more selected staff accounts are unavailable")

    direct_key = ":".join(sorted(requested)) if payload.kind == "direct" else None
    if direct_key:
        existing = (
            supabase.table("chat_conversations")
            .select("id,kind,name,created_by,created_at,last_message_at")
            .eq("direct_key", direct_key)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing:
            return {"conversation": existing[0], "created": False}

    name = _required_text(payload.name, "Group name", 80) if payload.kind == "group" else None
    created_rows = (
        supabase.table("chat_conversations")
        .insert({
            "kind": payload.kind,
            "name": name,
            "direct_key": direct_key,
            "created_by": actor.staff_id,
        })
        .select("id,kind,name,created_by,created_at,last_message_at")
        .execute()
        .data
        or []
    )
    if not created_rows:
        raise HTTPException(status_code=500, detail="Could not create conversation")
    conversation = created_rows[0]
    try:
        supabase.table("chat_conversation_members").insert([
            {
                "conversation_id": conversation["id"],
                "staff_id": staff_id,
                "member_role": "owner" if staff_id == actor.staff_id else "member",
            }
            for staff_id in requested
        ]).execute()
    except Exception as exc:
        try:
            supabase.table("chat_conversations").delete().eq("id", conversation["id"]).execute()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Could not add conversation members") from exc
    return {"conversation": conversation, "created": True}


@router.get("/conversations/{conversation_id}/messages")
def list_messages(
    conversation_id: uuid.UUID,
    before: datetime | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    actor: ChatActor = Depends(get_chat_actor),
):
    supabase = get_supabase_client()
    _require_member(supabase, str(conversation_id), actor)
    query = (
        supabase.table("chat_messages")
        .select("id,conversation_id,sender_staff_id,body,attachment_name,attachment_content_type,attachment_size,created_at,edited_at,deleted_at")
        .eq("conversation_id", str(conversation_id))
        .order("created_at", desc=True)
        .order("id", desc=True)
        .limit(limit)
    )
    if before:
        query = query.lt("created_at", before.astimezone(timezone.utc).isoformat())
    rows = query.execute().data or []
    return {"messages": list(reversed(rows)), "has_more": len(rows) == limit}


@router.post("/conversations/{conversation_id}/read")
def mark_read(conversation_id: uuid.UUID, actor: ChatActor = Depends(get_chat_actor)):
    supabase = get_supabase_client()
    _require_member(supabase, str(conversation_id), actor)
    supabase.table("chat_conversation_members").update({
        "last_read_at": datetime.now(timezone.utc).isoformat(),
        "unread_count": 0,
    }).eq("conversation_id", str(conversation_id)).eq("staff_id", actor.staff_id).execute()
    return {"ok": True}


def _validate_attachment(content_type: str, data: bytes) -> str:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Use a JPG, PNG, WebP, MP4, MOV, PDF, or plain text file")
    valid = {
        "image/jpeg": data.startswith(b"\xff\xd8\xff"),
        "image/png": data.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP",
        "video/mp4": len(data) >= 12 and data[4:8] == b"ftyp",
        "video/quicktime": len(data) >= 12 and data[4:8] == b"ftyp",
        "application/pdf": data.startswith(b"%PDF-"),
        "text/plain": b"\x00" not in data and _is_utf8(data),
    }
    if not valid[content_type]:
        raise HTTPException(status_code=415, detail="The file contents do not match the selected file type")
    return ALLOWED_CONTENT_TYPES[content_type]


def _is_utf8(data: bytes) -> bool:
    try:
        data.decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False


@router.post("/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: uuid.UUID,
    body: str = Form(default="", max_length=5000),
    file: UploadFile | None = File(default=None),
    actor: ChatActor = Depends(get_chat_actor),
):
    supabase = get_supabase_client()
    conversation_id_text = str(conversation_id)
    _require_member(supabase, conversation_id_text, actor)
    cleaned_body = (body or "").strip()
    if len(cleaned_body) > 5000:
        raise HTTPException(status_code=422, detail="Message is too long")
    if not cleaned_body and file is None:
        raise HTTPException(status_code=422, detail="Write a message or attach a file")

    message: dict = {
        "conversation_id": conversation_id_text,
        "sender_staff_id": actor.staff_id,
        "body": cleaned_body,
    }
    object_path = None
    if file is not None:
        content_type = (file.content_type or "").split(";")[0].strip().lower()
        data = file.file.read(MAX_ATTACHMENT_SIZE + 1)
        if not data:
            raise HTTPException(status_code=422, detail="The selected file is empty")
        if len(data) > MAX_ATTACHMENT_SIZE:
            raise HTTPException(status_code=413, detail="Files must be 20 MB or smaller")
        extension = _validate_attachment(content_type, data)
        safe_name = PurePath(file.filename or "attachment").name
        safe_name = re.sub(r"[\x00-\x1f\x7f]", "", safe_name).strip()[:180] or "attachment"
        object_path = f"{conversation_id_text}/{uuid.uuid4().hex}{extension}"
        try:
            supabase.storage.from_(ATTACHMENT_BUCKET).upload(
                object_path,
                data,
                {"content-type": content_type, "upsert": "false"},
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Could not upload the attachment") from exc
        message.update({
            "attachment_path": object_path,
            "attachment_name": safe_name,
            "attachment_content_type": content_type,
            "attachment_size": len(data),
        })

    try:
        inserted = (
            supabase.table("chat_messages")
            .insert(message)
            .select("id,conversation_id,sender_staff_id,body,attachment_name,attachment_content_type,attachment_size,created_at")
            .execute()
            .data
            or []
        )
        if not inserted:
            raise RuntimeError("No message row returned")
        return {"message": inserted[0]}
    except Exception as exc:
        if object_path:
            try:
                supabase.storage.from_(ATTACHMENT_BUCKET).remove([object_path])
            except Exception:
                pass
        raise HTTPException(status_code=500, detail="Could not save the message") from exc


@router.get("/messages/{message_id}/attachment")
def get_attachment_url(message_id: uuid.UUID, actor: ChatActor = Depends(get_chat_actor)):
    supabase = get_supabase_client()
    rows = (
        supabase.table("chat_messages")
        .select("id,conversation_id,attachment_path,attachment_name")
        .eq("id", str(message_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows or not rows[0].get("attachment_path"):
        raise HTTPException(status_code=404, detail="Attachment not found")
    message = rows[0]
    _require_member(supabase, message["conversation_id"], actor)
    try:
        response = supabase.storage.from_(ATTACHMENT_BUCKET).create_signed_url(
            message["attachment_path"], 60
        )
        signed_url = getattr(response, "signedURL", None)
        if signed_url is None and isinstance(response, dict):
            signed_url = response.get("signedURL") or response.get("signedUrl")
        if not signed_url:
            raise RuntimeError("Missing signed URL")
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not create a secure download link") from exc
    return {"url": signed_url, "file_name": message["attachment_name"]}
