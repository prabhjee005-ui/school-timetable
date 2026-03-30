import { useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import CurrentPeriodCard from './components/CurrentPeriodCard';
import TimetableTable from './components/TimetableTable';
import AIAllocationPanel from './components/AIAllocationPanel';
import AdjustmentsTable from './components/AdjustmentsTable';
import LeaveRequest from './pages/LeaveRequest';
import PrincipalView from './pages/PrincipalView';
import Login from './pages/Login';
import './App.css';

const AUTH_KEY = 'schoolTimetableAuth';

function readAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function roleToPath(role) {
  if (role === 'teacher') return '/leave';
  if (role === 'principal') return '/principal';
  if (role === 'admin') return '/admin';
  return '/leave';
}

export default function App() {
  const [activePeriodInfo, setActivePeriodInfo] = useState({ period: 1, isClosed: false });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [auth, setAuth] = useState(() => readAuth());
  const [path, setPath] = useState(() => window.location.pathname || '/');

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (to) => {
    if (window.location.pathname === to) return;
    window.history.pushState({}, '', to);
    setPath(to);
  };

  const destinationPath = useMemo(() => (auth ? roleToPath(auth.role) : '/login'), [auth]);

  useEffect(() => {
    if (!auth) {
      if (path !== '/login') navigate('/login');
      return;
    }

    // Always redirect logged-in users away from /login and / to their role page.
    if (path === '/login' || path === '/') {
      navigate(destinationPath);
      return;
    }

    if (path !== destinationPath) {
      navigate(destinationPath);
    }
  }, [auth, path, destinationPath]);

  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY);
    setAuth(null);
    navigate('/login');
  };

  const currentDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
  const displayDay = (activePeriodInfo.isClosed || currentDay === 'Sunday' || currentDay === 'Saturday')
    ? 'Monday'
    : currentDay;

  if (path === '/login' || !auth) {
    return (
      <Login
        onSuccess={(user) => {
          localStorage.setItem(AUTH_KEY, JSON.stringify(user));
          setAuth(user);
          navigate(roleToPath(user.role));
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 selection:bg-indigo-500/30">
      <Header user={auth} onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {(path === '/admin' || path === '/') && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2 space-y-6">
                <CurrentPeriodCard onPeriodChange={(info) => setActivePeriodInfo(info)} />
                <div className="h-[500px]">
                  <TimetableTable day={displayDay} period={activePeriodInfo.period} />
                </div>
              </div>

              <div className="lg:col-span-1">
                <AIAllocationPanel onAdjustmentCreated={() => setRefreshTrigger((prev) => prev + 1)} />
              </div>
            </div>

            <div className="mt-8">
              <AdjustmentsTable refreshTrigger={refreshTrigger} />
            </div>
          </>
        )}

        {path === '/leave' && (
          <div className="mt-2">
            <LeaveRequest auth={auth} />
          </div>
        )}

        {path === '/principal' && (
          <div className="mt-2">
            <PrincipalView />
          </div>
        )}
      </main>
    </div>
  );
}
