import { useEffect, useState } from 'react';
import api from '../api';

export default function PrincipalView() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchLeaveRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/leave-requests');
      setEntries(response.data.leave_requests || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load leave requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaveRequests();
  }, []);

  const approve = async (id) => {
    setActionLoadingId(id);
    try {
      await api.post(`/leave-requests/${id}/approve`);
      await fetchLeaveRequests();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to approve leave request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const reject = async (id) => {
    setActionLoadingId(id);
    try {
      await api.post(`/leave-requests/${id}/reject`);
      await fetchLeaveRequests();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to reject leave request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const pending = entries.filter((r) => r.status === 'pending');

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden flex flex-col">
      <div className="p-6 border-b border-slate-700/50 bg-slate-900/20 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-100">Principal View</h3>
          <p className="text-sm text-slate-400 mt-1">Approve or reject pending leave requests.</p>
        </div>
        <button
          onClick={fetchLeaveRequests}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900/50 border border-slate-700/50 text-slate-200 hover:bg-slate-700/50 transition-colors disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/50 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-700/50">
              <th className="px-6 py-4 font-medium">ID</th>
              <th className="px-6 py-4 font-medium">Teacher ID</th>
              <th className="px-6 py-4 font-medium">From</th>
              <th className="px-6 py-4 font-medium">To</th>
              <th className="px-6 py-4 font-medium">Reason</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {pending.length === 0 && !loading ? (
              <tr>
                <td colSpan="7" className="px-6 py-8 text-center text-slate-500">
                  No pending leave requests.
                </td>
              </tr>
            ) : (
              pending.map((row) => (
                <tr key={row.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-slate-300 font-medium">{row.id}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-slate-300 font-medium">{row.teacher_id}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-slate-300 font-medium">{row.from_date}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-slate-300 font-medium">{row.to_date}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-300 line-clamp-2 max-w-[350px]" title={row.reason}>
                      {row.reason}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => approve(row.id)}
                        disabled={actionLoadingId === row.id}
                        className="px-3 py-2 rounded-lg text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50"
                      >
                        {actionLoadingId === row.id ? 'Processing...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => reject(row.id)}
                        disabled={actionLoadingId === row.id}
                        className="px-3 py-2 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
                      >
                        {actionLoadingId === row.id ? 'Processing...' : 'Reject'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="p-4 border-t border-slate-700/50 bg-red-500/10 text-red-200 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}

