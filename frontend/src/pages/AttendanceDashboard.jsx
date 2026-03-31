import { useEffect, useMemo, useState } from 'react';
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

  const totalAbsencesThisMonth = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
    return (stats.absences_by_week || []).reduce((sum, row) => {
      const weekStart = row?.week_start || '';
      if (weekStart.startsWith(monthKey)) {
        return sum + Number(row?.absence_count || 0);
      }
      return sum;
    }, 0);
  }, [stats.absences_by_week]);

  const mostAbsentTeacher = useMemo(
    () => stats.most_absent_teachers?.[0]?.teacher_name || '-',
    [stats.most_absent_teachers],
  );

  const mostDisruptedPeriod = useMemo(() => {
    const period = stats.most_disrupted_periods?.[0]?.period_number;
    return period ? `Period ${period}` : '-';
  }, [stats.most_disrupted_periods]);

  const teacherTableRows = useMemo(() => {
    const absenceMap = new Map();
    const coverMap = new Map();

    (stats.most_absent_teachers || []).forEach((row) => {
      const name = row?.teacher_name || 'Unknown';
      absenceMap.set(name, Number(row?.absence_count || 0));
    });

    (stats.covering_workload || []).forEach((row) => {
      const name = row?.teacher_name || 'Unknown';
      coverMap.set(name, Number(row?.cover_count || 0));
    });

    const allTeachers = new Set([...absenceMap.keys(), ...coverMap.keys()]);
    return [...allTeachers]
      .map((teacherName) => ({
        teacher_name: teacherName,
        absences: absenceMap.get(teacherName) || 0,
        cover_periods_taken: coverMap.get(teacherName) || 0,
      }))
      .sort((a, b) => b.absences - a.absences || a.teacher_name.localeCompare(b.teacher_name));
  }, [stats.most_absent_teachers, stats.covering_workload]);

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
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl p-5">
              <p className="text-xs uppercase tracking-wide text-slate-400">Total Absences This Month</p>
              <p className="mt-2 text-3xl font-bold text-slate-100">{totalAbsencesThisMonth}</p>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl p-5">
              <p className="text-xs uppercase tracking-wide text-slate-400">Most Absent Teacher</p>
              <p className="mt-2 text-xl font-semibold text-slate-100">{mostAbsentTeacher}</p>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl p-5">
              <p className="text-xs uppercase tracking-wide text-slate-400">Most Disrupted Period</p>
              <p className="mt-2 text-xl font-semibold text-slate-100">{mostDisruptedPeriod}</p>
            </div>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50">
              <h4 className="text-lg font-semibold text-slate-100">Teacher Attendance Summary</h4>
              <p className="text-sm text-slate-400 mt-1">Sorted by highest absences first</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/40 text-xs uppercase tracking-wide text-slate-400 border-b border-slate-700/50">
                    <th className="px-5 py-3 font-medium">Teacher Name</th>
                    <th className="px-5 py-3 font-medium">Absences</th>
                    <th className="px-5 py-3 font-medium">Cover Periods Taken</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {teacherTableRows.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="px-5 py-6 text-center text-slate-500">
                        No attendance data available.
                      </td>
                    </tr>
                  ) : (
                    teacherTableRows.map((row) => (
                      <tr key={row.teacher_name} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-5 py-3 text-slate-200 font-medium">{row.teacher_name}</td>
                        <td className="px-5 py-3 text-slate-300">{row.absences}</td>
                        <td className="px-5 py-3 text-slate-300">{row.cover_periods_taken}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

