import { useState } from 'react';
import Header from './components/Header';
import CurrentPeriodCard from './components/CurrentPeriodCard';
import TimetableTable from './components/TimetableTable';
import AIAllocationPanel from './components/AIAllocationPanel';
import './App.css';

function App() {
  const [activePeriod, setActivePeriod] = useState(null);
  const currentDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 selection:bg-indigo-500/30">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <CurrentPeriodCard onPeriodChange={setActivePeriod} />
            <div className="h-[500px]">
              <TimetableTable day={currentDay === 'Sunday' || currentDay === 'Saturday' ? 'Monday' : currentDay} period={activePeriod} />
            </div>
          </div>
          
          <div className="lg:col-span-1 h-[620px]">
            <AIAllocationPanel />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
