import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import api from './api';
import Header from './components/Header';
import LoginPage from './components/LoginPage';
import CurrentPeriodCard from './components/CurrentPeriodCard';
import TimetableTable from './components/TimetableTable';
import AIAllocationPanel from './components/AIAllocationPanel';
import AdjustmentsTable from './components/AdjustmentsTable';
import LeaveRequest from './pages/LeaveRequest';
import PrincipalView from './pages/PrincipalView';
import AttendanceDashboard from './pages/AttendanceDashboard';
import SwapRequest from './pages/SwapRequest';
import AdminDashboard from './pages/AdminDashboard';
const StaffChat = lazy(() => import('./pages/StaffChat'));
import { DEFAULT_OPERATING_DAYS, getLocalDayName, getOperatingDays } from './utils/schoolSchedule';
import './App.css';

// Navigation component to handle active state
function Navigation({ isPrincipal }) {
  const location = useLocation();
  const path = location.pathname;

  const btnClass = (active) => `px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
    active
      ? 'bg-indigo-500 text-white border-indigo-400'
      : 'bg-slate-900/50 text-slate-200 border-slate-700/50 hover:bg-slate-700/50'
  }`;

  return (
    <div className="mb-6 flex items-center flex-wrap gap-3">
      <Link to="/" className={btnClass(path === '/')}>Timetable</Link>
      <Link to="/leave" className={btnClass(path === '/leave')}>Leave Request</Link>
      <Link to="/swap" className={btnClass(path === '/swap')}>Swap Request</Link>
      {isPrincipal && (
        <>
          <Link to="/principal" className={btnClass(path === '/principal' || path === '/attendance')}>Principal View</Link>
          <Link to="/admin" className={btnClass(path === '/admin')}>Admin Dashboard</Link>
        </>
      )}
    </div>
  );
}

function HomeContent({ operatingDays }) {
  const [activePeriodInfo, setActivePeriodInfo] = useState({ period: 1, isClosed: false });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const currentDay = getLocalDayName();

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 space-y-6">
          <CurrentPeriodCard onPeriodChange={(info) => setActivePeriodInfo(info)} />
          <div className="h-[500px]">
            <TimetableTable day={currentDay} period={activePeriodInfo.period} />
          </div>
        </div>
        <div className="lg:col-span-1">
          <AIAllocationPanel operatingDays={operatingDays} onAdjustmentCreated={() => setRefreshTrigger((prev) => prev + 1)} />
        </div>
      </div>
      <div className="mt-8">
        <AdjustmentsTable refreshTrigger={refreshTrigger} />
      </div>
    </>
  );
}

function App() {
  // Use hooks first and unconditionally at the top level
  const user = { id: 'DEV_ADMIN', role: 'principal' }; // DEV: auth disabled
  const isPrincipal = user?.role === 'principal';
  const [operatingDays, setOperatingDays] = useState(DEFAULT_OPERATING_DAYS);

  useEffect(() => {
    api.get('/settings/school_config')
      .then((response) => setOperatingDays(getOperatingDays(response.data)))
      .catch((error) => console.error('Failed to load school operating days:', error));
  }, []);

  useEffect(() => {
    const handleSchoolConfigUpdated = (event) => {
      setOperatingDays(getOperatingDays(event.detail));
    };
    window.addEventListener('school-config-updated', handleSchoolConfigUpdated);
    return () => window.removeEventListener('school-config-updated', handleSchoolConfigUpdated);
  }, []);

  // Heartbeat to keep Railway backend awake (every 4 minutes)
  useEffect(() => {
    const pingServer = async () => {
      try {
        await api.get('/ping');
      } catch (err) {
        console.warn('Heartbeat failed, server might be starting up...');
      }
    };
    pingServer();
    const interval = setInterval(pingServer, 240000); 
    return () => clearInterval(interval);
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-slate-900 text-slate-100 selection:bg-indigo-500/30">
        <Header />
        
        <Routes>
          {/* Admin route explicitly outside the main container if it needs full width, 
              but the user asked for a clean sidebar so I'll put it in a separate layout route if needed. 
              Actually, I'll just render it directly. */}
          <Route path="/admin" element={<AdminDashboard />} />
          
          <Route path="*" element={
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <Navigation isPrincipal={isPrincipal} />
              
              <Routes>
                <Route path="/" element={<HomeContent operatingDays={operatingDays} />} />
                <Route path="/leave" element={<LeaveRequest />} />
                <Route path="/swap" element={<SwapRequest operatingDays={operatingDays} />} />
                <Route path="/chat" element={<Suspense fallback={<div className="py-12 text-center text-slate-400">Loading staff chat…</div>}><StaffChat /></Suspense>} />
                <Route path="/principal" element={<PrincipalViewWithNav />} />
                <Route path="/attendance" element={<AttendanceDashboardWithNav />} />
              </Routes>
            </main>
          } />
        </Routes>
      </div>
    </Router>
  );
}

function PrincipalViewWithNav() {
  const navigate = useNavigate();
  return <PrincipalView onOpenDashboard={() => navigate('/attendance')} />;
}

function AttendanceDashboardWithNav() {
  const navigate = useNavigate();
  return <AttendanceDashboard onBack={() => navigate('/principal')} />;
}

export default App;
