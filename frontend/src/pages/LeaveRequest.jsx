import { useState } from 'react';
import api from '../api';

export default function LeaveRequest() {
  const [formData, setFormData] = useState({
    teacher_name: '',
    teacher_id: '',
    from_date: '',
    to_date: '',
    reason: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await api.post('/leave-requests', {
        teacher_id: formData.teacher_id,
        from_date: formData.from_date,
        to_date: formData.to_date,
        reason: formData.reason,
      });

      setSuccess('Leave request submitted successfully.');
      setFormData({
        teacher_name: '',
        teacher_id: '',
        from_date: '',
        to_date: '',
        reason: '',
      });
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit leave request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden flex flex-col">
      <div className="p-6 border-b border-slate-700/50 bg-slate-900/20">
        <h3 className="text-xl font-bold text-slate-100">Submit Leave Request</h3>
        <p className="text-sm text-slate-400 mt-1">Teachers can request leave for a date range.</p>
      </div>

      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Teacher Name</label>
            <input
              name="teacher_name"
              type="text"
              value={formData.teacher_name}
              onChange={handleChange}
              placeholder="e.g. Mr. Rajesh Kumar"
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Teacher ID</label>
            <input
              name="teacher_id"
              type="text"
              required
              value={formData.teacher_id}
              onChange={handleChange}
              placeholder="e.g. T01"
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">From Date</label>
              <input
                name="from_date"
                type="date"
                required
                value={formData.from_date}
                onChange={handleChange}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">To Date</label>
              <input
                name="to_date"
                type="date"
                required
                value={formData.to_date}
                onChange={handleChange}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Reason</label>
            <textarea
              name="reason"
              required
              value={formData.reason}
              onChange={handleChange}
              rows={4}
              placeholder="Enter reason for leave..."
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-2.5 px-4 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Submitting...' : 'Submit Leave'}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-200 whitespace-pre-wrap">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-200 whitespace-pre-wrap">
            {success}
          </div>
        )}
      </div>
    </div>
  );
}

