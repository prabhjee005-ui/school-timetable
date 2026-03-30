import { useState, useEffect } from 'react';
import { BookOpen, MapPin, Users, Loader2 } from 'lucide-react';
import api from '../api';

export default function TimetableTable({ day, period }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [localPeriod, setLocalPeriod] = useState(period || 1);

  // Sync local period if the parent explicitly updates to a new current active period
  useEffect(() => {
    if (period) setLocalPeriod(period);
  }, [period]);

  useEffect(() => {
    if (!localPeriod) return;
    
    const fetchTimetable = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/timetable?day=${day}&period=${localPeriod}`);
        setEntries(response.data.entries || []);
      } catch (error) {
        console.error("Error fetching timetable:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTimetable();
  }, [day, localPeriod]);

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-900/20">
        <div>
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-400" />
            Live Timetable
          </h3>
          <p className="text-sm text-slate-400 mt-1">{day} • Period {localPeriod}</p>
        </div>
        {loading && <Loader2 className="h-5 w-5 text-indigo-400 animate-spin" />}
      </div>
      
      <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-900/40">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
            <button
              key={p}
              onClick={() => setLocalPeriod(p)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                localPeriod === p
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20 border border-indigo-400'
                  : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-700 backdrop-blur-sm'
              }`}
            >
              Period {p}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/50 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-700/50">
              <th className="px-6 py-4 font-medium">CLASS</th>
              <th className="px-6 py-4 font-medium">SUBJECT</th>
              <th className="px-6 py-4 font-medium">TEACHER NAME</th>
              <th className="px-6 py-4 font-medium">TEACHER ID</th>
              <th className="px-6 py-4 font-medium">ROOM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {entries.length === 0 && !loading ? (
              <tr>
                <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                  No classes scheduled for this period.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-700/20 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-500" />
                      <span className="font-semibold text-slate-200">{entry.class_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-300">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {entry.subject}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-300">
                    <span className="font-medium text-slate-300">
                      {entry.teacher_name ?? '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                        {entry.teacher_id ? entry.teacher_id.substring(1) : ''}
                      </div>
                      <span className="text-slate-300 font-medium">
                        {entry.teacher_id ?? '-'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2 text-slate-400">
                      <MapPin className="h-4 w-4 opacity-70" />
                      <span>{entry.room}</span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
