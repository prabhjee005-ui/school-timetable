import { useState, useEffect } from 'react';
import { CalendarDays, Clock } from 'lucide-react';

export default function Header() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-slate-800/80 backdrop-blur border-b border-slate-700/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <CalendarDays className="h-6 w-6 text-indigo-400" />
            </div>
            <h1 className="text-xl font-semibold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              AI Timetable System | DPS Demo
            </h1>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/50 border border-slate-700/50 text-slate-300">
            <Clock className="h-4 w-4" />
            <span className="font-medium font-mono text-sm tracking-wide">
              {time.toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

