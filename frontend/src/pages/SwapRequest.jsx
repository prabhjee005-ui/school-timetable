import api from '../api';

const TEACHER_DIRECTORY = {
  "T01": "Mr. Rajesh Kumar",
  "T02": "Ms. Priya Sharma",
  "T03": "Mr. Amit Singh",
  "T04": "Ms. Sunita Verma",
  "T05": "Mr. Vikram Mehta",
  "T06": "Ms. Anjali Gupta",
  "T07": "Mr. Rohit Bhatia",
  "T08": "Ms. Kavita Nair",
  "T09": "Sunita Rao",
  "T10": "Deepak Nair"
};

export default function SwapRequest() {
  const [myTeacherId, setMyTeacherId] = useState('');
  const [isValidId, setIsValidId] = useState(false);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checkingId, setCheckingId] = useState(false);
  
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  const [formData, setFormData] = useState({
    requester_period: 1,
    requester_day: days.includes(today) ? today : 'Monday',
    target_teacher_id: '',
    target_period: '',
    target_day: ''
  });

  const fetchRequests = async () => {
    if (!isValidId) return;
    try {
      const res = await api.get(`/swap-requests/?teacher_id=${myTeacherId}`);
      setRequests(res.data.requests);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    }
  };

  useEffect(() => {
    if (isValidId) {
      fetchRequests();
      const interval = setInterval(fetchRequests, 10000); // Poll every 10s
      return () => clearInterval(interval);
    }
  }, [isValidId, myTeacherId]);

  const verifyId = async (retryCount = 0) => {
    if (!myTeacherId.trim()) return;
    setCheckingId(true);
    try {
      const res = await api.get(`/teachers/verify/${myTeacherId}`);
      if (res.data.valid) {
        setIsValidId(true);
        setCheckingId(false);
      } else {
        setIsValidId(false);
        setCheckingId(false);
        alert(res.data.message || 'Invalid Teacher ID');
      }
    } catch (err) {
      if (retryCount < 1) {
        console.log('Verification failed, retrying...');
        setTimeout(() => verifyId(retryCount + 1), 2000);
        return;
      }
      setIsValidId(false);
      setCheckingId(false);
      const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
      alert(isTimeout 
        ? 'Backend is waking up. Please wait 10 seconds and try again.' 
        : 'Connection dropped. Please check your network and try again.'
      );
    }
  };

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        requester_id: myTeacherId,
        requester_period: parseInt(formData.requester_period),
        requester_day: formData.requester_day,
        target_teacher_id: formData.target_teacher_id.trim() || null,
        target_period: formData.target_period ? parseInt(formData.target_period) : null,
        target_day: formData.target_day || null,
      };
      await api.post('/swap-requests/', payload);
      setFormData({
        requester_period: 1,
        requester_day: 'Monday',
        target_teacher_id: '',
        target_period: '',
        target_day: ''
      });
      fetchRequests();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error creating request');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id, action) => {
    try {
      await api.patch(`/swap-requests/${id}/${action}`);
      fetchRequests();
    } catch (err) {
      alert(`Error ${action}ing request`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this request?')) return;
    try {
      await api.delete(`/swap-requests/${id}`);
      fetchRequests();
    } catch (err) {
      alert('Failed to delete request');
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear all your requests?')) return;
    try {
      await api.delete(`/swap-requests/?teacher_id=${myTeacherId}`);
      fetchRequests();
    } catch (err) {
      alert('Failed to clear requests');
    }
  };

  const incoming = requests.filter(r => 
    (r.target_teacher_id === myTeacherId || r.target_teacher_id === null) && 
    r.requester_id !== myTeacherId && 
    r.status === 'pending'
  );
  const outgoing = requests.filter(r => r.requester_id === myTeacherId);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Identity Section */}
      <div className="bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-2xl shadow-xl p-6">
        <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">Your Teacher Identity</label>
        <div className="flex gap-3">
          <input
            type="text"
            value={myTeacherId}
            onChange={(e) => { setMyTeacherId(e.target.value); setIsValidId(false); }}
            placeholder="Enter Teacher ID (e.g. T01)"
            className="flex-1 bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-mono"
            disabled={isValidId}
          />
          {!isValidId ? (
            <button
              onClick={verifyId}
              disabled={checkingId}
              className="bg-indigo-500 hover:bg-indigo-600 px-6 py-3 rounded-xl font-medium transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
            >
              {checkingId ? 'Verifying...' : 'Unlock Features'}
            </button>
          ) : (
            <button
              onClick={() => setIsValidId(false)}
              className="bg-slate-700 hover:bg-slate-600 px-6 py-3 rounded-xl font-medium transition-all"
            >
              Change ID
            </button>
          )}
        </div>
      </div>

      {isValidId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Create Request Form */}
          <div className="bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-6 border-b border-slate-700/50 bg-slate-900/20">
              <h3 className="text-xl font-bold text-slate-100">Create Swap Request</h3>
              <p className="text-sm text-slate-400 mt-1">Initiate a swap for one of your periods.</p>
            </div>
            <form onSubmit={handleCreateRequest} className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">My Period</label>
                  <input
                    type="number"
                    min="1" max="8"
                    required
                    value={formData.requester_period}
                    onChange={(e) => setFormData({...formData, requester_period: e.target.value})}
                    className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">My Day</label>
                  <select
                    value={formData.requester_day}
                    onChange={(e) => setFormData({...formData, requester_day: e.target.value})}
                    className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                  >
                    {days.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-700/50">
                <label className="block text-xs font-bold text-indigo-400 mb-4 uppercase tracking-tighter">Target (Optional)</label>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Target Teacher ID</label>
                      <input
                        type="text"
                        placeholder="e.g. T05"
                        value={formData.target_teacher_id}
                        onChange={(e) => setFormData({...formData, target_teacher_id: e.target.value.toUpperCase()})}
                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-200 outline-none focus:border-indigo-500 transition-colors font-mono"
                      />
                      {formData.target_teacher_id && TEACHER_DIRECTORY[formData.target_teacher_id] && (
                        <p className="mt-1 text-xs text-indigo-400 font-medium ml-1">
                          {TEACHER_DIRECTORY[formData.target_teacher_id]}
                        </p>
                      )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Target Period</label>
                      <input
                        type="number"
                        min="1" max="8"
                        value={formData.target_period}
                        onChange={(e) => setFormData({...formData, target_period: e.target.value})}
                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Target Day</label>
                      <select
                        value={formData.target_day}
                        onChange={(e) => setFormData({...formData, target_day: e.target.value})}
                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                      >
                        <option value="">Any Day</option>
                        {days.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl py-3 px-4 font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
              >
                {loading ? 'Submitting...' : 'Submit Swap Request'}
              </button>
            </form>
          </div>

          <div className="space-y-8">
            {/* Incoming Requests */}
            <div className="bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-700/50 bg-slate-900/20">
                <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  Incoming Requests
                  {incoming.length > 0 && <span className="bg-indigo-500 text-[10px] px-2 py-0.5 rounded-full">{incoming.length}</span>}
                </h3>
              </div>
              <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
                {incoming.length === 0 ? (
                  <p className="text-center py-8 text-slate-500 text-sm italic">No pending requests for you.</p>
                ) : (
                  incoming.map(req => (
                    <div key={req.id} className="bg-slate-900/40 border border-slate-700/30 rounded-xl p-4 flex flex-col gap-3 group hover:border-indigo-500/30 transition-all">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-bold text-slate-200">
                            {req.requester_id} - {TEACHER_DIRECTORY[req.requester_id] || 'Unknown'}
                          </p>
                          <p className="text-xs text-slate-400">P{req.requester_period} on {req.requester_day}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-indigo-400 uppercase font-bold tracking-widest">Wants Your</p>
                          <p className="text-xs text-slate-200">P{req.target_period} on {req.target_day}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAction(req.id, 'accept')}
                          className="flex-1 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/20 rounded-lg py-1.5 text-xs font-bold transition-all"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleAction(req.id, 'reject')}
                          className="flex-1 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 rounded-lg py-1.5 text-xs font-bold transition-all"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Outgoing Requests */}
            <div className="bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-700/50 bg-slate-900/20 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-100">My Requests</h3>
                {outgoing.length > 0 && (
                  <button 
                    onClick={handleClearAll}
                    className="text-[10px] text-slate-500 hover:text-red-400 uppercase font-bold tracking-widest transition-colors"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                {outgoing.length === 0 ? (
                  <p className="text-center py-8 text-slate-500 text-sm italic">You haven't made any requests yet.</p>
                ) : (
                  outgoing.map(req => (
                    <div key={req.id} className="bg-slate-900/40 border border-slate-700/30 rounded-xl p-3 flex justify-between items-center text-sm">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-200">P{req.requester_period} {req.requester_day}</span>
                            <span className="text-slate-500">→</span>
                            <span className="text-slate-200">
                              {req.target_teacher_id 
                                ? `${req.target_teacher_id} (${TEACHER_DIRECTORY[req.target_teacher_id] || 'Other'})` 
                                : 'Anyone'}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500">Created {new Date(req.created_at).toLocaleDateString()}</p>
                        </div>
                      <div className="flex items-center gap-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          req.status === 'accepted' ? 'bg-emerald-500/20 text-emerald-400' :
                          req.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>
                          {req.status}
                        </span>
                        <button 
                          onClick={() => handleDelete(req.id)}
                          className="text-slate-500 hover:text-red-400 transition-colors p-1"
                          title="Delete Request"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
