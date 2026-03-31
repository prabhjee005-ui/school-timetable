import { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import api from '../api';

export default function AttendanceDashboard({ onBack }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    most_absent_teachers: [],
    absences_by_week: [],
    most_disrupted_periods: [],
    covering_workload: [],
  });

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get('/analytics/attendance-stats');
        setStats(response.data || {});
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load attendance analytics.');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const absentTeachersData = useMemo(
    () => (stats.most_absent_teachers || []).slice(0, 10),
    [stats.most_absent_teachers],
  );
  const absencesByWeekData = useMemo(
    () => stats.absences_by_week || [],
    [stats.absences_by_week],
  );
  const disruptedPeriodsData = useMemo(
    () => stats.most_disrupted_periods || [],
    [stats.most_disrupted_periods],
  );
  const coveringWorkloadData = useMemo(
    () => (stats.covering_workload || []).slice(0, 10),
    [stats.covering_workload],
  );

  const chartCard = (title, subtitle, chart) => (
    <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl shadow-xl p-4 sm:p-6">
      <h4 className="text-base sm:text-lg font-semibold text-slate-100">{title}</h4>
      <p className="text-xs sm:text-sm text-slate-400 mt-1">{subtitle}</p>
      <div className="h-72 sm:h-80 mt-4">{chart}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-slate-100">Attendance Dashboard</h3>
          <p className="text-sm text-slate-400 mt-1">Absence and coverage trends for principal insights.</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900/50 border border-slate-700/50 text-slate-200 hover:bg-slate-700/50 transition-colors"
        >
          Back to Principal View
        </button>
      </div>

      {loading && (
        <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl p-6 text-slate-300">
          Loading attendance analytics...
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-red-200 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {chartCard(
            'Most Absent Teachers',
            'Teachers with highest absence count',
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={absentTeachersData} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="teacher_name" angle={-20} textAnchor="end" interval={0} height={60} stroke="#94a3b8" />
                <YAxis allowDecimals={false} stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="absence_count" name="Absences" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>,
          )}

          {chartCard(
            'Absences by Week',
            'Weekly absence totals over the last 8 weeks',
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={absencesByWeekData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="week_start" stroke="#94a3b8" />
                <YAxis allowDecimals={false} stroke="#94a3b8" />
                <Tooltip />
                <Line type="monotone" dataKey="absence_count" name="Absences" stroke="#22d3ee" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>,
          )}

          {chartCard(
            'Most Disrupted Periods',
            'Periods with the most recorded disruptions',
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={disruptedPeriodsData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="period_number" stroke="#94a3b8" />
                <YAxis allowDecimals={false} stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="disruption_count" name="Disruptions" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>,
          )}

          {chartCard(
            'Covering Teacher Workload',
            'Teachers taking the most cover periods',
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={coveringWorkloadData} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="teacher_name" angle={-20} textAnchor="end" interval={0} height={60} stroke="#94a3b8" />
                <YAxis allowDecimals={false} stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="cover_count" name="Cover Count" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>,
          )}
        </div>
      )}
    </div>
  );
}

