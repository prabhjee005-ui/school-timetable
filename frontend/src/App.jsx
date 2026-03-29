import { useState } from 'react';
import Header from './components/Header';
import CurrentPeriodCard from './components/CurrentPeriodCard';
import TimetableTable from './components/TimetableTable';
import AIAllocationPanel from './components/AIAllocationPanel';
import AdjustmentsTable from './components/AdjustmentsTable';
import './App.css';

function App() {
  const [activePeriodInfo, setActivePeriodInfo] = useState({ period: 1, isClosed: false });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const currentDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];

  // If school is closed (or it's weekend), we force Monday Period 1 for demo purposes.
  const displayDay = (activePeriodInfo.isClosed || currentDay === 'Sunday' || currentDay === 'Saturday') 
    ? 'Monday' 
    : currentDay;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 selection:bg-indigo-500/30">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 space-y-6">
            <CurrentPeriodCard onPeriodChange={(info) => setActivePeriodInfo(info)} />
            <div className="h-[500px]">
              <TimetableTable day={displayDay} period={activePeriodInfo.period} />
            </div>
          </div>
          
          <div className="lg:col-span-1">
            <AIAllocationPanel onAdjustmentCreated={() => setRefreshTrigger(prev => prev + 1)} />
          </div>
        </div>

        <div className="mt-8">
          <AdjustmentsTable refreshTrigger={refreshTrigger} />
        </div>
      </main>
    </div>
  );
}

export default App;
