import { useState } from 'react';
import Header from './components/Header';
import CurrentPeriodCard from './components/CurrentPeriodCard';
import TimetableTable from './components/TimetableTable';
import AIAllocationPanel from './components/AIAllocationPanel';
import AdjustmentsTable from './components/AdjustmentsTable';
import LeaveRequest from './pages/LeaveRequest';
import PrincipalView from './pages/PrincipalView';
import './App.css';

function App() {
  const [activePeriodInfo, setActivePeriodInfo] = useState({ period: 1, isClosed: false });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [page, setPage] = useState('home');
  const currentDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];

  // If school is closed (or it's weekend), we force Monday Period 1 for demo purposes.
  const displayDay = (activePeriodInfo.isClosed || currentDay === 'Sunday' || currentDay === 'Saturday') 
    ? 'Monday' 
    : currentDay;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 selection:bg-indigo-500/30">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => setPage('home')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              page === 'home'
                ? 'bg-indigo-500 text-white border-indigo-400'
                : 'bg-slate-900/50 text-slate-200 border-slate-700/50 hover:bg-slate-700/50'
            }`}
          >
            Timetable
          </button>
          <button
            onClick={() => setPage('leave')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              page === 'leave'
                ? 'bg-indigo-500 text-white border-indigo-400'
                : 'bg-slate-900/50 text-slate-200 border-slate-700/50 hover:bg-slate-700/50'
            }`}
          >
            Leave Request
          </button>
          <button
            onClick={() => setPage('principal')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              page === 'principal'
                ? 'bg-indigo-500 text-white border-indigo-400'
                : 'bg-slate-900/50 text-slate-200 border-slate-700/50 hover:bg-slate-700/50'
            }`}
          >
            Principal View
          </button>
        </div>

        {page === 'home' && (
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

        {page === 'leave' && (
          <div className="mt-2">
            <LeaveRequest />
          </div>
        )}

        {page === 'principal' && (
          <div className="mt-2">
            <PrincipalView />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
