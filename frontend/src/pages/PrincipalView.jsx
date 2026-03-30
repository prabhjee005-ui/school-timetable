import { useEffect, useState } from 'react';
import api from '../api';

export default function PrincipalView() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all'); // all | pending | approved | rejected

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
      alert('Leave request approved! Cover teachers assigned.');
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const reject = async (id) => {
    setActionLoadingId(id);
    try {
      await api.post(`/leave-requests/${id}/reject`);
      await fetchLeaveRequests();
      alert('Leave request rejected.');
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const normalizedStatus = (status) => (status ?? '').toString().toLowerCase();

  const filtered = entries.filter((r) => {
    const status = normalizedStatus(r.status);
    if (statusFilter === 'all') return true;
    return status === statusFilter;
  });

  const statusBadge = (status) => {
    const normalized = normalizedStatus(status);
    if (normalized === 'approved') {
      return {
        className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
        label: 'approved',
      };
    }
    if (normalized === 'rejected') {
      return {
        className: 'bg-red-500/10 text-red-400 border border-red-500/20',
        label: 'rejected',
      };
    }
    return {
      className: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
      label: 'pending',
    };
  };

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden flex flex-col">
      <div className="p-6 border-b border-slate-700/50 bg-slate-900/20 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-100">Principal View</h3>
          <p className="text-sm text-slate-400 mt-1">Review and approve/reject leave requests.</p>
        </div>
        <button
          onClick={fetchLeaveRequests}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900/50 border border-slate-700/50 text-slate-200 hover:bg-slate-700/50 transition-colors disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="px-6 py-4 border-b border-slate-700/50 flex flex-wrap gap-2">
        {[
          { id: 'all', label: 'All' },
          { id: 'pending', label: 'Pending' },
          { id: 'approved', label: 'Approved' },
          { id: 'rejected', label: 'Rejected' },
        ].map((btn) => {
          const active = statusFilter === btn.id;
          return (
            <button
              key={btn.id}
              onClick={() => setStatusFilter(btn.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                active
                  ? 'bg-indigo-500 text-white border-indigo-400'
                  : 'bg-slate-900/50 text-slate-200 border-slate-700/50 hover:bg-slate-700/50'
              }`}
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/50 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-700/50">
              <th className="px-6 py-4 font-medium">ID</th>
              <th className="px-6 py-4 font-medium">Teacher ID</th>
              <th className="px-6 py-4 font-medium">Teacher Name</th>
              <th className="px-6 py-4 font-medium">From</th>
              <th className="px-6 py-4 font-medium">To</th>
              <th className="px-6 py-4 font-medium">Reason</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {filtered.length === 0 && !loading ? (
              <tr>
                <td colSpan="8" className="px-6 py-8 text-center text-slate-500">
                  No leave requests found for this filter.
                </td>
              </tr>
            ) : (
              filtered.map((row, idx) => {
                const badge = statusBadge(row.status);
                const status = normalizedStatus(row.status);
                const canAct = status === 'pending';
                const rowKey = row.id ?? idx;
                return (
                  <tr key={rowKey} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-slate-300 font-medium">{row.id}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-slate-300 font-medium">{row.teacher_id}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-slate-300 font-medium">{row.teacher_name ?? '-'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-slate-300 font-medium">{row.from_date}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-slate-300 font-medium">{row.to_date}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div
                        className="text-sm text-slate-300 line-clamp-2 max-w-[350px]"
                        title={row.reason}
                      >
                        {row.reason}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {canAct ? (
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
                      ) : (
                        <span className="text-slate-400 font-medium">-</span>
                      )}
                    </td>
                  </tr>
                );
              })
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

