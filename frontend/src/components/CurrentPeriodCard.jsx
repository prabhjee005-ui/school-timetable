import { useState, useEffect } from 'react';
import { Activity, Clock } from 'lucide-react';
import api from '../api';

export default function CurrentPeriodCard({ onPeriodChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCurrentPeriod = async () => {
      try {
        const response = await api.get('/current-period');
        setData(response.data);
        const isActive = response.data.active_period !== null && response.data.active_period !== undefined;
        if (onPeriodChange) {
          onPeriodChange({
            period: isActive ? response.data.active_period : 1,
            isClosed: !isActive
          });
        }
      } catch (error) {
        console.error("Error fetching current period:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentPeriod();
    const interval = setInterval(fetchCurrentPeriod, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [onPeriodChange]);

  if (loading) {
    return (
      <div className="bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-2xl p-6 animate-pulse">
        <div className="h-6 w-1/3 bg-slate-700/50 mb-4 rounded"></div>
        <div className="h-10 w-2/3 bg-slate-700/50 rounded"></div>
      </div>
    );
  }

  const isActive = data?.active_period !== null && data?.active_period !== undefined;

  return (
    <div className="group bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-2xl p-6 shadow-xl transition-all hover:border-slate-600/50 hover:shadow-2xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            {isActive ? (
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            ) : (
              <span className="relative flex h-3 w-3">
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
            )}
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Status
            </h3>
          </div>
          
          {isActive ? (
            <div>
              <h2 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
                Period {data.active_period}
              </h2>
              <div className="mt-3 flex items-center gap-2 text-slate-400 bg-slate-900/50 w-fit px-3 py-1.5 rounded-lg border border-slate-700/50">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-mono">{data.start_time} - {data.end_time}</span>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
                School Closed
              </h2>
              <p className="mt-2 text-slate-400 text-sm">No active periods right now.</p>
            </div>
          )}
        </div>
        
        <div className={`p-4 rounded-xl shadow-inner ${isActive ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
          <Activity className={`h-8 w-8 ${isActive ? 'text-emerald-400' : 'text-amber-400'}`} />
        </div>
      </div>
    </div>
  );
}
