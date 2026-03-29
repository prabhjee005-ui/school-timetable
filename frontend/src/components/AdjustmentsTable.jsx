import { useState, useEffect } from 'react';
import { CalendarRange, MapPin, Users, Loader2, Trash2 } from 'lucide-react';
import api from '../api';

export default function AdjustmentsTable({ refreshTrigger }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    const fetchAdjustments = async () => {
      setLoading(true);
      try {
        // Explicitly format today's date in local client timezone to prevent mismatch with server's UTC
        const today = new Date().toISOString().split('T')[0];
        const response = await api.get(`/adjustments/today?query_date=${today}`);
        setEntries(response.data.adjustments || []);
      } catch (error) {
        console.error("Error fetching adjustments:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAdjustments();
  }, [refreshTrigger]);

  const handleDelete = async (id) => {
    try {
      setDeletingId(id);
      await api.delete(`/adjustments/${id}`);
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (error) {
      console.error("Failed to delete adjustment:", error);
      alert("Failed to delete adjustment");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden flex flex-col mt-6">
      <div className="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-900/40">
        <div>
          <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <CalendarRange className="h-6 w-6 text-emerald-400" />
            Today's Adjustments
          </h3>
          <p className="text-sm text-slate-400 mt-1">Live overview of cover classes running right now.</p>
        </div>
        {loading && <Loader2 className="h-5 w-5 text-emerald-400 animate-spin" />}
      </div>
      
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/50 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-700/50">
              <th className="px-6 py-4 font-medium">Class</th>
              <th className="px-6 py-4 font-medium">Subject</th>
              <th className="px-6 py-4 font-medium">Covering Teacher</th>
              <th className="px-6 py-4 font-medium">AI Reasoning</th>
              <th className="px-6 py-4 font-medium">Room</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {entries.length === 0 && !loading ? (
              <tr>
                <td colSpan="6" className="px-6 py-8 text-center text-slate-500">
                  No adjustments require cover today.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-emerald-500/70" />
                      <span className="font-semibold text-slate-200">{entry.class_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-300">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {entry.subject}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-400">
                        {entry.covering_teacher_id.substring(1)}
                      </div>
                      <span className="text-slate-300 font-medium">{entry.covering_teacher_id}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-300 line-clamp-2 max-w-[250px]" title={entry.ai_reasoning}>
                      {entry.ai_reasoning}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2 text-slate-400">
                      <MapPin className="h-4 w-4 opacity-70 text-slate-500" />
                      <span>{entry.room}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      className="text-slate-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-400/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete adjustment"
                    >
                      {deletingId === entry.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
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
