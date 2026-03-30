import { useState } from 'react';
import api from '../api';

export default function Login({ onSuccess }) {
  const [formData, setFormData] = useState({
    teacher_id: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const resp = await api.post('/auth/login', formData);
      onSuccess?.(resp.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 selection:bg-indigo-500/30 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-700/50 bg-slate-900/20">
          <h3 className="text-xl font-bold text-slate-100">Login</h3>
          <p className="text-sm text-slate-400 mt-1">Enter your teacher credentials.</p>
        </div>

        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
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

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Password</label>
              <input
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleChange}
                placeholder="password123"
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-2.5 px-4 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-200 whitespace-pre-wrap">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

