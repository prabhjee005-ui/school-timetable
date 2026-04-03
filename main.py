from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.analytics import router as analytics_router
from routers.absences import router as absences_router
from routers.ai_allocation import router as ai_allocation_router
from routers.leave_requests import router as leave_requests_router
from routers.periods import router as periods_router
from routers.teachers import router as teachers_router
from routers.timetable import router as timetable_router
from routers.settings import router as settings_router
from routers.ai_settings import router as ai_settings_router
from routers.swap_requests import router as swap_requests_router

app = FastAPI(title="AI School Timetable Management System")

# Keep CORS open for local React integration during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://school-timetable-ten.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(periods_router)
app.include_router(timetable_router)
app.include_router(absences_router)
app.include_router(ai_allocation_router)
app.include_router(leave_requests_router)
app.include_router(teachers_router)
app.include_router(settings_router)
app.include_router(ai_settings_router)
app.include_router(swap_requests_router, prefix="/swap-requests")
app.include_router(analytics_router, prefix="/analytics")


@app.get("/")
def root():
    return {"message": "AI School Timetable API is running"}


@app.get("/ping")
def ping():
    return {"status": "ok"}
