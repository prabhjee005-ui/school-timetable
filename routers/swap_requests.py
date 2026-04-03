from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException
from typing import Optional, List
from database import get_supabase_client

router = APIRouter(tags=["Swap Requests"])

class SwapRequestCreate(BaseModel):
    requester_id: str
    requester_period: int
    requester_day: str
    target_teacher_id: Optional[str] = None
    target_period: Optional[int] = None
    target_day: Optional[str] = None

@router.post("/")
def create_swap_request(payload: SwapRequestCreate):
    """
    Submit a new swap request.
    """
    supabase = get_supabase_client()
    
    # Optional: Add validation if teacher exists, but keeping it simple as per instructions.
    
    data = payload.model_dump()
    data["status"] = "pending"
    
    insert_response = (
        supabase.table("swap_requests")
        .insert(data)
        .execute()
    )
    
    if not insert_response.data:
        raise HTTPException(status_code=400, detail="Failed to create swap request")
        
    return {
        "message": "Swap request submitted successfully",
        "request": insert_response.data[0],
    }

@router.get("/")
def get_swap_requests(teacher_id: str):
    """
    Get swap requests for a specific teacher (incoming and outgoing).
    """
    supabase = get_supabase_client()
    
    # Fetch where teacher is the requester OR the target
    # Supabase Python client doesn't support easy OR in flat query for across columns 
    # but we can use RPC or two separate queries. 
    # Let's try or filter syntax if supported: .or_('requester_id.eq.T01','target_teacher_id.eq.T01')
    
    response = (
        supabase.table("swap_requests")
        .select("*")
        .or_(f"requester_id.eq.{teacher_id},target_teacher_id.eq.{teacher_id}")
        .order("created_at", desc=True)
        .execute()
    )
    
    return {
        "requests": response.data
    }

@router.patch("/{id}/accept")
def accept_swap_request(id: int):
    """
    Accept a swap request.
    """
    supabase = get_supabase_client()
    
    update_response = (
        supabase.table("swap_requests")
        .update({"status": "accepted"})
        .eq("id", id)
        .execute()
    )
    
    if not update_response.data:
        raise HTTPException(status_code=404, detail="Swap request not found")
        
    return {
        "message": "Swap request accepted",
        "request": update_response.data[0]
    }

@router.patch("/{id}/reject")
def reject_swap_request(id: int):
    """
    Reject a swap request.
    """
    supabase = get_supabase_client()
    
    update_response = (
        supabase.table("swap_requests")
        .update({"status": "rejected"})
        .eq("id", id)
        .execute()
    )
    
    if not update_response.data:
        raise HTTPException(status_code=404, detail="Swap request not found")
        
    return {
        "message": "Swap request rejected",
        "request": update_response.data[0]
    }

@router.delete("/{id}")
def delete_swap_request(id: int):
    """
    Delete a single swap request by its ID.
    """
    supabase = get_supabase_client()
    
    delete_response = (
        supabase.table("swap_requests")
        .delete()
        .eq("id", id)
        .execute()
    )
    
    if not delete_response.data:
        raise HTTPException(status_code=404, detail="Swap request not found")
        
    return {"message": "Swap request deleted successfully"}

@router.delete("/")
def clear_swap_requests(teacher_id: str):
    """
    Clear all swap requests for a specific teacher.
    """
    supabase = get_supabase_client()
    
    # Delete requests where teacher is requester OR target
    delete_response = (
        supabase.table("swap_requests")
        .delete()
        .or_(f"requester_id.eq.{teacher_id},target_teacher_id.eq.{teacher_id}")
        .execute()
    )
    
    return {"message": f"Cleared {len(delete_response.data)} requests"}
