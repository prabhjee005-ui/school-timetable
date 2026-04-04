import { useState, useEffect } from 'react';
import { 
  Settings, 
  Users, 
  Calendar, 
  Cpu, 
  BarChart3, 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  AlertCircle,
  Menu,
  X,
  CalendarDays,
  LayoutGrid,
  ChevronLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('school');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // --- CLASS TIMETABLE DRILL-DOWN STATE ---
  const [viewLevel, setViewLevel] = useState('grade'); // grade, section, view
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [todayAdjustments, setTodayAdjustments] = useState([]);

  // --- SCHOOL SETUP STATE ---
  const [schoolConfig, setSchoolConfig] = useState({
    school_name: '',
    num_periods: 8,
    recess_after_period: 4,
    class_names: []
  });
  const [newClassName, setNewClassName] = useState('');

  // --- TEACHER MANAGEMENT STATE ---
  const [teachers, setTeachers] = useState([]);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [newTeacher, setNewTeacher] = useState({ id: '', name: '', subjects: '' });

  // --- TIMETABLE BUILDER STATE ---
  const [masterTimetable, setMasterTimetable] = useState([]);
  const [builderData, setBuilderData] = useState({}); // { '6A-1': 'T01', ... }

  // --- AI SETTINGS STATE ---
  const [aiConfig, setAiConfig] = useState({
    prefer_subject_match: true,
    avoid_double_assignments: true,
    max_extra_periods: 3
  });

  // --- SYSTEM OVERVIEW ---
  const [stats, setStats] = useState({
    totalTeachers: 0,
    totalClasses: 0,
    completionRate: 0
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const todayDate = new Date().toISOString().split('T')[0];
      const [schoolRes, aiRes, teachersRes, timetableRes, adjustmentsRes] = await Promise.all([
        api.get('/settings/school_config'),
        api.get('/ai-settings/ai_config'),
        api.get('/teachers'),
        api.get('/timetable/all'),
        api.get(`/adjustments/today?query_date=${todayDate}`)
      ]);

      setSchoolConfig(schoolRes.data);
      setAiConfig(aiRes.data);
      setTeachers(teachersRes.data.teachers);
      setMasterTimetable(timetableRes.data.entries);
      setTodayAdjustments(adjustmentsRes.data.adjustments || []);
      
      // Initialize builder grid
      const grid = {};
      timetableRes.data.entries.forEach(entry => {
        grid[`${entry.class_name}-${entry.period_number}-${entry.day}`] = entry.teacher_id;
      });
      setBuilderData(grid);

      // Simple stats
      const classes = [...new Set(timetableRes.data.entries.map(e => e.class_name))];
      setStats({
        totalTeachers: teachersRes.data.teachers.length,
        totalClasses: schoolRes.data.class_names.length || classes.length,
        completionRate: calculateCompletion(timetableRes.data.entries, schoolRes.data)
      });
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
    }
  };

  const calculateCompletion = (entries, config) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const totalExpected = (config.class_names?.length || 0) * (config.num_periods || 8) * days.length;
    if (totalExpected === 0) return 0;
    return Math.round((entries.length / totalExpected) * 100);
  };

  // --- HANDLERS ---
  const handleSaveSchool = async () => {
    try {
      await api.post('/settings/school_config', { value: schoolConfig });
      alert('School settings saved!');
    } catch (err) {
      alert('Failed to save school settings');
    }
  };

  const handleAddClass = () => {
    if (newClassName && !schoolConfig.class_names.includes(newClassName)) {
      setSchoolConfig({
        ...schoolConfig,
        class_names: [...schoolConfig.class_names, newClassName]
      });
      setNewClassName('');
    }
  };

  const handleRemoveClass = (cls) => {
    setSchoolConfig({
      ...schoolConfig,
      class_names: schoolConfig.class_names.filter(c => c !== cls)
    });
  };

  const handleAddTeacher = async () => {
    try {
      const payload = {
        ...newTeacher,
        subjects: newTeacher.subjects.split(',').map(s => s.trim())
      };
      await api.post('/teachers', payload);
      setNewTeacher({ id: '', name: '', subjects: '' });
      fetchInitialData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to add teacher');
    }
  };

  const handleDeleteTeacher = async (id) => {
    if (window.confirm('Delete this teacher?')) {
      try {
        await api.delete(`/teachers/${id}`);
        fetchInitialData();
      } catch (err) {
        alert('Failed to delete teacher');
      }
    }
  };

  const handleSaveTimetable = async () => {
    try {
      const entries = Object.entries(builderData).map(([key, teacherId]) => {
        const [className, periodStr, day] = key.split('-');
        return {
          day,
          period_number: parseInt(periodStr),
          class_name: className,
          teacher_id: teacherId,
          subject: teachers.find(t => t.id === teacherId)?.subjects?.[0] || 'General'
        };
      });
      await api.post('/timetable/bulk', { entries });
      alert('Timetable saved successfully!');
      fetchInitialData();
    } catch (err) {
      alert('Failed to save timetable');
    }
  };

  const navItems = [
    { id: 'class_timetable', label: 'Class Timetable', icon: LayoutGrid, color: 'text-pink-400' },
    { id: 'school', label: 'School Setup', icon: Settings, color: 'text-blue-400' },
    { id: 'teachers', label: 'Teacher Management', icon: Users, color: 'text-green-400' },
    { id: 'timetable', label: 'Timetable Builder', icon: Calendar, color: 'text-amber-400' },
    { id: 'ai', label: 'AI Settings', icon: Cpu, color: 'text-purple-400' },
    { id: 'overview', label: 'System Overview', icon: BarChart3, color: 'text-indigo-400' }
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden">
      {/* Sidebar */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 border-r border-slate-800 transition-all duration-300 flex flex-col`}>
        <div 
          className="p-6 flex items-center justify-between cursor-pointer group"
          onClick={() => navigate('/')}
          title="Go to Home"
        >
          <div className="flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-indigo-400" />
            {isSidebarOpen && (
              <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent group-hover:opacity-80 transition-opacity">
                ADMIN
              </span>
            )}
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation(); // Don't trigger logo redirect
              setIsSidebarOpen(!isSidebarOpen);
            }} 
            className="p-2 hover:bg-slate-800 rounded-lg ml-auto"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 py-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                activeTab === item.id 
                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <item.icon size={20} className={activeTab === item.id ? item.color : 'text-slate-500'} />
              {isSidebarOpen && <span className="font-medium text-sm">{item.label}</span>}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-white">
              {navItems.find(i => i.id === activeTab)?.label}
            </h2>
            <p className="text-slate-400 mt-1">Manage your school's AI-powered timetable system.</p>
          </div>
          <div className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm font-medium text-slate-300">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </header>

        {/* --- SECTION: CLASS TIMETABLE DRILL-DOWN --- */}
        {activeTab === 'class_timetable' && (
          <div className="space-y-6">
            {/* Breadcrumbs / Navigation */}
            <div className="flex items-center gap-3 text-sm mb-4">
              <span 
                className="text-slate-400 cursor-pointer hover:text-indigo-400 transition-colors"
                onClick={() => { setViewLevel('grade'); setSelectedGrade(null); setSelectedSection(null); }}
              >
                Class Timetable
              </span>
              {selectedGrade && (
                <>
                  <span className="text-slate-600">/</span>
                  <span 
                    className="text-slate-400 cursor-pointer hover:text-indigo-400 transition-colors"
                    onClick={() => { setViewLevel('section'); setSelectedSection(null); }}
                  >
                    {selectedGrade}{selectedGrade === 1 ? 'st' : selectedGrade === 2 ? 'nd' : selectedGrade === 3 ? 'rd' : 'th'} Grade
                  </span>
                </>
              )}
              {selectedSection && (
                <>
                  <span className="text-slate-600">/</span>
                  <span className="text-indigo-400 font-medium">{selectedSection}</span>
                </>
              )}
            </div>

            {/* LEVEL 1: GRADE SELECTION */}
            {viewLevel === 'grade' && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(grade => (
                  <button
                    key={grade}
                    onClick={() => { setSelectedGrade(grade); setViewLevel('section'); }}
                    className="p-8 bg-slate-900/50 border border-slate-800 rounded-3xl hover:border-indigo-500/50 hover:bg-slate-800/80 transition-all group text-center"
                  >
                    <div className="text-3xl font-bold bg-indigo-400 bg-clip-text text-transparent group-hover:scale-110 transition-transform">
                      {grade}{grade === 1 ? 'st' : grade === 2 ? 'nd' : grade === 3 ? 'rd' : 'th'}
                    </div>
                    <div className="text-xs text-slate-500 mt-2 font-medium uppercase tracking-widest">Select Grade</div>
                  </button>
                ))}
              </div>
            )}

            {/* LEVEL 2: SECTION SELECTION */}
            {viewLevel === 'section' && (
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => { setViewLevel('grade'); setSelectedGrade(null); }}
                    className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <h3 className="text-2xl font-bold text-white">Select Section</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {schoolConfig.class_names
                    .filter(c => {
                      const gradeNum = c.match(/^(\d+)/)?.[0];
                      return gradeNum === selectedGrade.toString();
                    })
                    .map(className => (
                      <button
                        key={className}
                        onClick={() => { setSelectedSection(className); setViewLevel('view'); }}
                        className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl hover:border-indigo-500/50 hover:bg-slate-800/80 transition-all text-center"
                      >
                        <div className="text-xl font-bold text-slate-200">{className}</div>
                      </button>
                    ))}
                  {schoolConfig.class_names.filter(c => c.startsWith(selectedGrade.toString())).length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500 bg-slate-900/20 rounded-3xl border border-dashed border-slate-800">
                      No sections found for {selectedGrade}th Grade.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* LEVEL 3: TIMETABLE VIEW */}
            {viewLevel === 'view' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => { setViewLevel('section'); setSelectedSection(null); }}
                      className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <div>
                      <h3 className="text-2xl font-bold text-white">Timetable: {selectedSection}</h3>
                      <p className="text-sm text-slate-400">Weekly schedule overview</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800">
                          <th className="p-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest border-r border-slate-800 w-32">Day</th>
                          {[...Array(schoolConfig.num_periods || 8)].map((_, i) => (
                            <th key={i} className="p-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest border-r border-slate-800 last:border-0 min-w-[120px]">
                              Period {i + 1}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
                          <tr key={day} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/20 transition-colors">
                            <td className="p-4 font-bold text-indigo-400 text-sm border-r border-slate-800 bg-slate-900/30">{day}</td>
                            {[...Array(schoolConfig.num_periods || 8)].map((_, i) => {
                              const pNum = i + 1;
                              const entry = masterTimetable.find(e => e.day === day && e.period_number === pNum && e.class_name === selectedSection);
                              const teacher = teachers.find(t => t.id === entry?.teacher_id);
                              
                              return (
                                <td key={i} className="p-3 border-r border-slate-800 last:border-0 text-center align-middle h-24">
                                  {entry ? (
                                    <div className="space-y-1">
                                      <div className="font-bold text-white text-sm">{entry.subject}</div>
                                      <div className="text-[10px] text-slate-400 bg-slate-950/50 py-1 px-2 rounded-md border border-slate-800 overflow-hidden text-ellipsis whitespace-nowrap">
                                        {teacher?.name || entry.teacher_id}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-[10px] text-slate-700 italic">Free</div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* TODAY'S ADJUSTED TIMETABLE */}
                <div className="space-y-6 pt-6 border-t border-slate-800">
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      Today's Timetable — {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </h3>
                    <p className="text-sm text-slate-400">Schedule updated with live covers and adjustments</p>
                  </div>

                  <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-800">
                            <th className="p-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest border-r border-slate-800 w-32">Today</th>
                            {[...Array(schoolConfig.num_periods || 8)].map((_, i) => (
                              <th key={i} className="p-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest border-r border-slate-800 last:border-0 min-w-[120px]">
                                Period {i + 1}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors">
                            <td className="p-4 font-bold text-indigo-400 border-r border-slate-800 text-sm whitespace-nowrap">
                              {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
                            </td>
                            {[...Array(schoolConfig.num_periods || 8)].map((_, i) => {
                              const periodNum = i + 1;
                              const todayDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
                              const entry = masterTimetable.find(e => e.class_name === selectedSection && e.day === todayDay && e.period_number === periodNum);
                              
                              // Check for adjustment (SILENT REPLACEMENT)
                              const adjustment = todayAdjustments.find(a => a.class_name === selectedSection && a.period_number === periodNum);
                              
                              const teacher = teachers.find(t => t.id === (adjustment ? adjustment.covering_teacher_id : entry?.teacher_id));
                              
                              return (
                                <td key={i} className="p-4 border-r border-slate-800 last:border-0 text-center min-w-[120px]">
                                  {entry || adjustment ? (
                                    <div className="space-y-1">
                                      <div className="text-sm font-bold text-slate-100">{entry?.subject || adjustment?.subject}</div>
                                      <div className="text-xs text-indigo-400 font-medium">
                                        {teacher?.name || (adjustment ? adjustment.covering_teacher_name : entry?.teacher_id)}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-xs font-medium text-slate-600 italic">Free</div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- SECTION: SCHOOL SETUP --- */}
        {activeTab === 'school' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 space-y-6">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <Settings className="text-blue-400" size={20} /> General Configuration
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">School Name</label>
                  <input 
                    type="text" 
                    value={schoolConfig.school_name} 
                    onChange={e => setSchoolConfig({...schoolConfig, school_name: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Periods / Day</label>
                    <input 
                      type="number" 
                      value={schoolConfig.num_periods} 
                      onChange={e => setSchoolConfig({...schoolConfig, num_periods: parseInt(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Recess After Period</label>
                    <input 
                      type="number" 
                      value={schoolConfig.recess_after_period} 
                      onChange={e => setSchoolConfig({...schoolConfig, recess_after_period: parseInt(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                </div>
                <button onClick={handleSaveSchool} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98]">
                  Save Changes
                </button>
              </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 space-y-6">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <Users className="text-cyan-400" size={20} /> Class Names
              </h3>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="e.g. 10A"
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value.toUpperCase())}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <button onClick={handleAddClass} className="px-6 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all">
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[200px] p-1">
                {(schoolConfig.class_names || []).map(cls => (
                  <span key={cls} className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-lg text-sm group">
                    {cls}
                    <button onClick={() => handleRemoveClass(cls)} className="text-indigo-500/50 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- SECTION: TEACHER MANAGEMENT --- */}
        {activeTab === 'teachers' && (
          <div className="space-y-8">
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
              <h3 className="text-xl font-semibold mb-6">Add New Teacher</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">ID (e.g. T11)</label>
                  <input 
                    type="text" 
                    value={newTeacher.id}
                    onChange={e => setNewTeacher({...newTeacher, id: e.target.value.toUpperCase()})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
                  <input 
                    type="text" 
                    value={newTeacher.name}
                    onChange={e => setNewTeacher({...newTeacher, name: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Subjects (comma separated)</label>
                  <input 
                    type="text" 
                    placeholder="Math, Science"
                    value={newTeacher.subjects}
                    onChange={e => setNewTeacher({...newTeacher, subjects: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <button onClick={handleAddTeacher} className="h-[50px] bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2">
                  <Plus size={20} /> Add Teacher
                </button>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-900/50 border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">ID</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Subjects</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {teachers.map(t => (
                    <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-mono text-indigo-400">{t.id}</td>
                      <td className="px-6 py-4 font-medium text-slate-200">{t.name}</td>
                      <td className="px-6 py-4 text-slate-400">
                        <div className="flex gap-1 flex-wrap">
                          {t.subjects?.map(s => <span key={s} className="px-2 py-0.5 bg-slate-950 rounded border border-slate-800 text-xs">{s}</span>)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all"><Edit2 size={16} /></button>
                          <button onClick={() => handleDeleteTeacher(t.id)} className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- SECTION: TIMETABLE BUILDER --- */}
        {activeTab === 'timetable' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
              <div className="flex gap-4 items-center">
                <span className="text-sm font-medium text-slate-400">Target Day:</span>
                <select className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 focus:outline-none">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <button 
                onClick={handleSaveTimetable}
                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2"
              >
                <Save size={20} /> Save Master Timetable
              </button>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-x-auto shadow-2xl p-1">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr>
                    <th className="p-4 border-b border-slate-800 sticky left-0 bg-slate-900 z-10 w-32 font-bold text-slate-500 uppercase tracking-wider">Class</th>
                    {Array.from({ length: schoolConfig.num_periods || 8 }).map((_, i) => (
                      <th key={i} className="p-4 border-b border-slate-800 text-center font-bold text-slate-500 uppercase tracking-wider text-xs">
                        Period {i + 1}
                        {i + 1 === schoolConfig.recess_after_period && <div className="text-[10px] text-cyan-400 mt-1 uppercase font-black tracking-widest">Recess</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {(schoolConfig.class_names || []).map(cls => (
                    <tr key={cls} className="hover:bg-slate-800/20 group transition-colors">
                      <td className="p-4 font-bold text-indigo-400 sticky left-0 bg-slate-900 z-10 shadow-xl group-hover:bg-slate-800/40 transition-colors border-r border-slate-800/50">
                        {cls}
                      </td>
                      {Array.from({ length: schoolConfig.num_periods || 8 }).map((_, i) => {
                        const pNum = i + 1;
                        const day = 'Monday'; // Default for builder view, would need a day switcher
                        const key = `${cls}-${pNum}-${day}`;
                        const val = builderData[key] || '';
                        
                        return (
                          <td key={i} className={`p-2 min-w-[140px] border-r border-slate-800/30 ${!val ? 'bg-red-500/5' : ''}`}>
                            <select 
                              value={val}
                              onChange={e => setBuilderData({...builderData, [key]: e.target.value})}
                              className={`w-full bg-slate-950 border text-xs rounded-lg p-2 focus:outline-none transition-all ${
                                !val ? 'border-red-500/30 italic text-slate-500' : 'border-slate-800 text-slate-200'
                              }`}
                            >
                              <option value="">-- Assign --</option>
                              {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.id})</option>)}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 text-red-400 text-sm pl-2">
              <AlertCircle size={16} />
              Highlighted cells indicate missing teacher assignments.
            </div>
          </div>
        )}

        {/* --- SECTION: AI SETTINGS --- */}
        {activeTab === 'ai' && (
          <div className="max-w-2xl bg-slate-900/50 border border-slate-800 rounded-3xl p-8 space-y-8">
            <div className="space-y-6">
              <h3 className="text-xl font-semibold flex items-center gap-2 border-b border-slate-800 pb-4">
                <Cpu className="text-purple-400" size={24} /> AI Allocation Rules
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50">
                  <div>
                    <h4 className="font-medium">Prefer Subject Match</h4>
                    <p className="text-sm text-slate-500">AI will prioritize teachers who specialize in the class subject.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={aiConfig.prefer_subject_match}
                    onChange={e => setAiConfig({...aiConfig, prefer_subject_match: e.target.checked})}
                    className="w-6 h-6 accent-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50">
                  <div>
                    <h4 className="font-medium">Avoid Double Assignments</h4>
                    <p className="text-sm text-slate-500">Do not assign two covering classes to the same teacher simultaneously.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={aiConfig.avoid_double_assignments}
                    onChange={e => setAiConfig({...aiConfig, avoid_double_assignments: e.target.checked})}
                    className="w-6 h-6 accent-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Max Extra Periods / Day</label>
                  <input 
                    type="number" 
                    value={aiConfig.max_extra_periods}
                    onChange={e => setAiConfig({...aiConfig, max_extra_periods: parseInt(e.target.value)})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                  <p className="mt-2 text-xs text-slate-500">Maximum substitutions a teacher can take in a single day.</p>
                </div>
              </div>

              <button 
                onClick={async () => {
                  try {
                    await api.post('/ai-settings/ai_config', { value: aiConfig });
                    alert('AI preferences saved and synced!');
                  } catch(err) { 
                    alert(err.response?.data?.detail || 'Failed to save AI preferences'); 
                  }
                }}
                className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-purple-500/20"
              >
                Sync with AI Engine
              </button>
            </div>
          </div>
        )}

        {/* --- SECTION: SYSTEM OVERVIEW --- */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col items-center text-center">
                <Users className="text-green-400 mb-4" size={40} />
                <span className="text-4xl font-bold text-white mb-2">{stats.totalTeachers}</span>
                <span className="text-slate-500 font-medium uppercase tracking-widest text-xs">Total Teachers</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col items-center text-center">
                <Calendar className="text-blue-400 mb-4" size={40} />
                <span className="text-4xl font-bold text-white mb-2">{stats.totalClasses}</span>
                <span className="text-slate-500 font-medium uppercase tracking-widest text-xs">Active Classes</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col items-center text-center">
                <Cpu className="text-amber-400 mb-4" size={40} />
                <span className="text-4xl font-bold text-white mb-2">{stats.completionRate}%</span>
                <span className="text-slate-500 font-medium uppercase tracking-widest text-xs">Timetable Integrity</span>
              </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
              <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <BarChart3 className="text-indigo-400" size={24} /> Recent Activity Log
              </h3>
              <div className="space-y-4">
                {[
                  { text: 'Master Timetable updated for Monday', time: '2 mins ago', type: 'update' },
                  { text: 'New teacher T11 added to database', time: '1 hour ago', type: 'add' },
                  { text: 'AI Preferences synced with rules engine', time: '3 hours ago', type: 'system' },
                  { text: 'School recess shifted to after Period 4', time: 'Yesterday', type: 'config' }
                ].map((log, i) => (
                  <div key={i} className="flex justify-between items-center p-4 bg-slate-950/30 rounded-2xl border border-slate-800/30 hover:bg-slate-900/50 transition-colors">
                    <span className="text-slate-300 font-medium">{log.text}</span>
                    <span className="text-xs text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">{log.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
