import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, ShieldCheck, UserCircle, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [id, setId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Artificial delay for premium feel
    setTimeout(() => {
      const success = login(id);
      if (!success) {
        setError('Invalid Teacher/Principal ID');
        setLoading(false);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo Section */}
        <div 
          className="text-center mb-10 cursor-pointer group" 
          onClick={() => navigate('/')}
          title="Go to Home"
        >
          <div className="inline-flex p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 mb-4 group-hover:bg-indigo-500/20 transition-all">
            <ShieldCheck className="h-10 w-10 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight group-hover:opacity-80 transition-opacity">
            AI Timetable System
          </h1>
          <p className="text-slate-400 mt-2 font-medium">
            Secure access for teachers and administrators
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 shadow-2xl overflow-hidden relative">
          {/* Progress bar line for loading */}
          {loading && (
            <div className="absolute top-0 left-0 h-1 bg-indigo-500 animate-[loading_1.5s_ease-in-out_infinite]" />
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label 
                htmlFor="userId" 
                className="block text-sm font-semibold text-slate-300 mb-2 ml-1"
              >
                Teacher or Principal ID
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <UserCircle className="h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                </div>
                <input
                  id="userId"
                  type="text"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  placeholder="e.g. T01 or P01"
                  className="block w-full pl-11 pr-4 py-3.5 bg-slate-950/50 border border-slate-700/50 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition-all text-lg font-medium"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm animate-shake">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-900/20 hover:shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Sign In
                  <LogIn className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-800 text-center">
            <p className="text-xs text-slate-500 font-medium">
              Demo Access: Use IDs T01 through T10 or P01
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes loading {
          0% { width: 0%; left: 0; }
          50% { width: 100%; left: 0; }
          100% { width: 0%; left: 100%; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 0s 2;
        }
      `}</style>
    </div>
  );
}
