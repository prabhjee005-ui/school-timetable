# 🏫 AI School Timetable System

A smart, AI-powered school timetable and adjustment management system built for real schools.

## 🚀 Live Demo
- Frontend: https://school-timetable-ten.vercel.app
- Backend: https://school-timetable-production.up.railway.app

## ✨ Features
- 📅 Live Timetable — view current period and class schedule
- 🤖 AI Teacher Allocation — automatically finds the best covering teacher when someone is absent
- 📋 Daily Adjustment Chart — generates and exports a printable PDF for notice boards
- 🏖️ Leave Request System — teachers can apply for leave
- 🔄 Swap Request System — teachers can swap periods with each other
- 👨💼 Principal View — approve/reject leave and swap requests
- 🔐 Role-based Access — Teachers, Principal, and Admin have separate access
- 🏫 Admin Dashboard — manage school setup, teachers, timetable, and AI settings

## 🛠️ Tech Stack
- Frontend: React (Vite) deployed on Vercel
- Backend: FastAPI deployed on Railway
- Database: Supabase (PostgreSQL)
- AI: Groq API for teacher allocation suggestions
- PDF Export: jsPDF + jspdf-autotable

## 👥 Roles
| Role | ID | Access |
|------|----|--------|
| Teacher | T01-T10 | Timetable, Leave Request, Swap Request |
| Principal | P01 | Everything + Principal View |
| Admin | A01 | Admin Dashboard |

## 🏃 Running Locally
### Backend
pip install -r requirements.txt
uvicorn main:app --reload

### Frontend
cd frontend
npm install
npm run dev

## 🔮 Roadmap
- [x] UI Redesign
- [x] Swap Request improvements
- [x] Login/Auth system
- [x] PDF Export — Adjustment Chart
- [x] Admin Dashboard
- [x] Class Timetable View
- [ ] Full Auth re-enable
- [ ] Multi-school support (SaaS)

## 👨💻 Built By
Built with 💙 and lots of late nights 🌙