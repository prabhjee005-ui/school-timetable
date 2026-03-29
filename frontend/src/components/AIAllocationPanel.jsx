import { useState } from 'react';
import { Bot, Sparkles, Check, AlertCircle, Loader2 } from 'lucide-react';
import api from '../api';

export default function AIAllocationPanel({ onAdjustmentCreated }) {
  const [formData, setFormData] = useState({
    day: 'Monday',
    date: new Date().toISOString().split('T')[0],
    period_number: 1,
    class_name: '',
    subject: '',
    room: '',
    original_teacher_id: ''
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let finalValue = value;
    if (name === 'period_number') finalValue = parseInt(value);
    else if (name === 'original_teacher_id') finalValue = value.trim();
    
    setFormData(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleFindCover = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setSuccess(false);

    try {
      const response = await api.post('/find-covering-teacher', formData);
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to find covering teacher.");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/create-adjustment', {
        date: formData.date,
        period_number: formData.period_number,
        class_name: formData.class_name,
        original_teacher_id: formData.original_teacher_id,
        covering_teacher_id: result.assigned_teacher_id,
        subject: formData.subject,
        room: formData.room,
        ai_reasoning: result.reason
      });
      setSuccess(true);
      if (onAdjustmentCreated) onAdjustmentCreated();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create adjustment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden flex flex-col">
      <div className="p-6 border-b border-slate-700/50 bg-slate-900/20">
        <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <Bot className="h-5 w-5 text-indigo-400" />
          AI Teacher Allocation
        </h3>
        <p className="text-sm text-slate-400 mt-1">Find the best covering teacher automatically considering workload limits.</p>
      </div>

      <div className="p-6">
        <form onSubmit={handleFindCover} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Date</label>
              <input type="date" name="date" required value={formData.date} onChange={handleInputChange} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Day of Week</label>
              <select name="day" value={formData.day} onChange={handleInputChange} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Period (1-8)</label>
              <input type="number" name="period_number" min="1" max="8" required value={formData.period_number} onChange={handleInputChange} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Original Teacher ID</label>
              <input type="text" name="original_teacher_id" required placeholder="e.g. T01" value={formData.original_teacher_id} onChange={handleInputChange} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Class</label>
              <input type="text" name="class_name" required placeholder="e.g. 10A" value={formData.class_name} onChange={handleInputChange} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Subject</label>
              <input type="text" name="subject" required placeholder="e.g. Physics" value={formData.subject} onChange={handleInputChange} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Room</label>
              <input type="text" name="room" required placeholder="e.g. Room 101" value={formData.room} onChange={handleInputChange} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500" />
            </div>
          </div>
          
          <button type="submit" disabled={loading || saving} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-2.5 px-4 text-sm font-medium transition-colors flex items-center justify-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Analyzing...' : 'Find Cover'}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300 whitespace-pre-wrap">{error}</p>
          </div>
        )}

        {result && !success && (
          <div className="mt-6 border-t border-slate-700/50 pt-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Bot className="h-24 w-24 text-indigo-400" />
              </div>
              <h4 className="text-sm font-semibold text-indigo-300 uppercase tracking-wider mb-2 gap-2 flex items-center">
                <Sparkles className="h-4 w-4" /> AI Suggestion
              </h4>
              <div className="text-2xl font-bold text-slate-100 flex items-center gap-3 mb-4">
                Assign Teacher <span className="bg-indigo-500 text-white px-3 py-1 rounded-lg shadow-inner">{result.assigned_teacher_id}</span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed max-w-[85%]">{result.reason}</p>
              
              <button onClick={handleApprove} disabled={saving} className="mt-5 w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg py-3 px-6 text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-5 w-5" />}
                {saving ? 'Confirming...' : 'Confirm Adjustment'}
              </button>
            </div>
          </div>
        )}

        {success && (
          <div className="mt-6 p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center animate-in zoom-in">
            <div className="mx-auto bg-emerald-500 w-12 h-12 rounded-full flex items-center justify-center mb-3 shadow-lg shadow-emerald-500/20">
              <Check className="h-6 w-6 text-white" />
            </div>
            <h4 className="font-semibold text-emerald-400 mb-1">Adjustment Saved!</h4>
            <p className="text-xs text-emerald-500/80">The timetable has been updated and extra period limits recorded.</p>
          </div>
        )}
      </div>
    </div>
  );
}
