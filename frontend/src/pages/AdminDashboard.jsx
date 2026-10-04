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
import { DEFAULT_OPERATING_DAYS, WEEKDAY_OPTIONS, getDefaultOperatingDay, getLocalDateString, getLocalDayName, getOperatingDays } from '../utils/schoolSchedule';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const now = new Date();
  const currentDay = getLocalDayName(now);
  const currentDateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
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
    num_periods: 9,
    recess_after_period: null,
    class_names: [],
    operating_days: DEFAULT_OPERATING_DAYS
  });
  const [newClassName, setNewClassName] = useState('');
  const [allocationPreview, setAllocationPreview] = useState(null);
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [allocationError, setAllocationError] = useState('');

  // --- TEACHER MANAGEMENT STATE ---
  const [teachers, setTeachers] = useState([]);
  const [directoryStaff, setDirectoryStaff] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState('');
  const [staffWriteEnabled, setStaffWriteEnabled] = useState(false);
  const [directorySearch, setDirectorySearch] = useState('');
  const [directoryDepartment, setDirectoryDepartment] = useState('');
  const [directoryTab, setDirectoryTab] = useState('staff');
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [issues, setIssues] = useState(null);
  const [staffDraft, setStaffDraft] = useState(null);
  const [assignmentDraft, setAssignmentDraft] = useState(null);

  // --- TIMETABLE BUILDER STATE ---
  const [masterTimetable, setMasterTimetable] = useState([]);
  const [builderData, setBuilderData] = useState({}); // cell key -> parallel [staffCode, subject] selections
  const [allocationReview, setAllocationReview] = useState(null);
  const [builderDay, setBuilderDay] = useState(getDefaultOperatingDay(DEFAULT_OPERATING_DAYS));

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
    fetchStaffDirectory();
  }, []);

  const fetchStaffDirectory = async () => {
    setDirectoryLoading(true);
    setDirectoryError('');
    try {
      const response = await api.get('/staff');
      const rows = response.data.staff || [];
      setDirectoryStaff(rows);
      setStaffWriteEnabled(Boolean(response.data.write_enabled));
      if (selectedStaff && rows.some(row => row.id === selectedStaff.id)) {
        const detail = await api.get(`/staff/${selectedStaff.id}`);
        setSelectedStaff(detail.data.staff);
      } else if (rows.length && !selectedStaff) {
        const detail = await api.get(`/staff/${rows[0].id}`);
        setSelectedStaff(detail.data.staff);
      }
    } catch (err) {
      setDirectoryError(err.response?.data?.detail || 'Could not load the staff directory.');
    } finally {
      setDirectoryLoading(false);
    }
  };

  const selectDirectoryTab = async (tab) => {
    setDirectoryTab(tab);
    if (tab === 'issues') {
      try {
        const response = await api.get('/staff/issues');
        setIssues(response.data);
      } catch (err) {
        setDirectoryError(err.response?.data?.detail || 'Could not load allocation issues.');
      }
    }
  };

  const openStaffDetail = async (id) => {
    setDirectoryError('');
    try {
      const response = await api.get(`/staff/${id}`);
      setSelectedStaff(response.data.staff);
      setStaffDraft(null);
      setAssignmentDraft(null);
    } catch (err) {
      setDirectoryError(err.response?.data?.detail || 'Could not load this staff record.');
    }
  };

  const saveStaffDraft = async () => {
    if (!staffDraft || !staffWriteEnabled) return;
    const payload = {
      staff_code: staffDraft.staff_code.trim(),
      full_name: staffDraft.full_name.trim(),
      department: staffDraft.department.trim() || null,
      roles: staffDraft.roles.split(',').map(value => value.trim()).filter(Boolean),
      email: staffDraft.email.trim() || null,
      notes: staffDraft.notes.trim() || null
    };
    try {
      const response = staffDraft.id
        ? await api.patch(`/staff/${staffDraft.id}`, payload)
        : await api.post('/staff', payload);
      const savedId = staffDraft.id || response.data.staff.id;
      setStaffDraft(null);
      await fetchStaffDirectory();
      await openStaffDetail(savedId);
    } catch (err) {
      setDirectoryError(err.response?.data?.detail || 'Could not save staff details.');
    }
  };

  const deactivateStaff = async (id) => {
    if (!staffWriteEnabled || !window.confirm('Deactivate this staff member?')) return;
    try {
      await api.delete(`/staff/${id}`);
      setSelectedStaff(null);
      await fetchStaffDirectory();
    } catch (err) {
      setDirectoryError(err.response?.data?.detail || 'Could not deactivate staff member.');
    }
  };

  const saveAssignmentDraft = async () => {
    if (!assignmentDraft || !selectedStaff || !staffWriteEnabled) return;
    const payload = {
      subject: assignmentDraft.subject.trim() || null,
      target_type: assignmentDraft.target_type,
      sections: assignmentDraft.sections.split(',').map(value => value.trim()).filter(Boolean),
      periods_per_week: assignmentDraft.periods_per_week === '' ? null : Number(assignmentDraft.periods_per_week),
      raw_text: assignmentDraft.raw_text.trim() || null
    };
    try {
      if (assignmentDraft.id) await api.patch(`/assignments/${assignmentDraft.id}`, payload);
      else await api.post(`/staff/${selectedStaff.id}/assignments`, payload);
      setAssignmentDraft(null);
      await openStaffDetail(selectedStaff.id);
      await fetchStaffDirectory();
    } catch (err) {
      setDirectoryError(err.response?.data?.detail || 'Could not save assignment.');
    }
  };

  const removeAssignment = async (assignmentId) => {
    if (!staffWriteEnabled || !window.confirm('Delete this assignment?')) return;
    try {
      await api.delete(`/assignments/${assignmentId}`);
      await openStaffDetail(selectedStaff.id);
      await fetchStaffDirectory();
    } catch (err) {
      setDirectoryError(err.response?.data?.detail || 'Could not delete assignment.');
    }
  };

  const previewAllocationSections = async () => {
    setAllocationLoading(true);
    setAllocationError('');
    try {
      const response = await api.get('/sections');
      setAllocationPreview(response.data.sections || []);
    } catch (err) {
      setAllocationError(err.response?.data?.detail || 'Could not load allocation sections.');
      setAllocationPreview(null);
    } finally {
      setAllocationLoading(false);
    }
  };

  const fetchInitialData = async () => {
    try {
      const todayDate = getLocalDateString();
      const [schoolRes, aiRes, teachersRes, timetableRes, adjustmentsRes, allocationRes] = await Promise.all([
        api.get('/settings/school_config'),
        api.get('/ai-settings/ai_config'),
        api.get('/teachers'),
        api.get('/timetable/all'),
        api.get(`/adjustments/today?query_date=${todayDate}`),
        api.get('/timetable/allocation-review')
      ]);

      const config = { ...schoolRes.data, operating_days: getOperatingDays(schoolRes.data) };
      setSchoolConfig(config);
      setBuilderDay(getDefaultOperatingDay(config.operating_days));
      setAiConfig(aiRes.data);
      setTeachers(teachersRes.data.teachers);
      setMasterTimetable(timetableRes.data.entries);
      setTodayAdjustments(adjustmentsRes.data.adjustments || []);
      setAllocationReview(allocationRes.data);
      
      // Initialize builder grid
      const grid = {};
      timetableRes.data.entries.forEach(entry => {
        const key = JSON.stringify([entry.class_name, entry.period_number, entry.day]);
        grid[key] ||= [];
        grid[key].push(JSON.stringify([entry.teacher_id, entry.subject]));
      });
      setBuilderData(grid);

      // Simple stats
      const classes = [...new Set(timetableRes.data.entries.map(e => e.class_name))];
      setStats({
        totalTeachers: teachersRes.data.teachers.length,
        totalClasses: schoolRes.data.class_names.length || classes.length,
        completionRate: calculateCompletion(timetableRes.data.entries, config)
      });
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
    }
  };

  const calculateCompletion = (entries, config) => {
    const days = config.operating_days || [];
    const totalExpected = (config.class_names?.length || 0) * (config.num_periods || 9) * days.length;
    if (totalExpected === 0) return 0;
    const occupiedClassPeriods = new Set(entries.map(e => JSON.stringify([e.class_name, e.period_number, e.day]))).size;
    return Math.round((occupiedClassPeriods / totalExpected) * 100);
  };

  // --- HANDLERS ---
  const handleSaveSchool = async () => {
    try {
      await api.post('/settings/school_config', { value: schoolConfig });
      window.dispatchEvent(new CustomEvent('school-config-updated', { detail: schoolConfig }));
      alert('School settings saved!');
    } catch {
      alert('Failed to save school settings');
    }
  };

  const toggleOperatingDay = (day) => {
    const selectedDays = new Set(schoolConfig.operating_days || []);
    if (selectedDays.has(day)) selectedDays.delete(day);
    else selectedDays.add(day);
    const operatingDays = WEEKDAY_OPTIONS.filter(option => selectedDays.has(option));
    setSchoolConfig({ ...schoolConfig, operating_days: operatingDays });
    setBuilderDay(getDefaultOperatingDay(operatingDays));
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

  const handleSaveTimetable = async () => {
    try {
      const entries = [];
      const clear = [];
      Object.entries(builderData).forEach(([key, teacherChoices]) => {
        const [className, periodNumber, day] = JSON.parse(key);
        // Replace each edited cell as a group so removed parallel subjects do
        // not remain in the database when another subject in that cell stays.
        clear.push({ day, period_number: periodNumber, class_name: className });
        if (!teacherChoices.length) {
          return;
        }
        teacherChoices.forEach(choice => {
          let teacherChoice;
          try { teacherChoice = JSON.parse(choice); } catch { teacherChoice = [choice, 'General']; }
          if (teacherChoice?.[0]) entries.push({
            day,
            period_number: periodNumber,
            class_name: className,
            teacher_id: teacherChoice[0],
            subject: teacherChoice[1] || 'General'
          });
        });
      });
      await api.post('/timetable/bulk', { entries, clear });
      alert('Timetable saved successfully!');
      fetchInitialData();
    } catch {
      alert('Failed to save timetable');
    }
  };

  const updateBuilderChoice = (key, index, value) => {
    setBuilderData(current => {
      const choices = [...(current[key] || [])];
      if (!value) choices.splice(index, 1);
      else choices[index] = value;
      return { ...current, [key]: choices };
    });
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
            {currentDateLabel}
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
                          {[...Array(schoolConfig.num_periods || 9)].map((_, i) => (
                            <th key={i} className="p-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest border-r border-slate-800 last:border-0 min-w-[120px]">
                              Period {i + 1}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(schoolConfig.operating_days || []).map((day) => (
                          <tr key={day} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/20 transition-colors">
                            <td className="p-4 font-bold text-indigo-400 text-sm border-r border-slate-800 bg-slate-900/30">{day}</td>
                            {[...Array(schoolConfig.num_periods || 9)].map((_, i) => {
                              const pNum = i + 1;
                              const slotEntries = masterTimetable.filter(e => e.day === day && e.period_number === pNum && e.class_name === selectedSection);
                              
                              return (
                                <td key={i} className="p-3 border-r border-slate-800 last:border-0 text-center align-middle h-24">
                                  {slotEntries.length ? (
                                    <div className="space-y-2">
                                      {slotEntries.map(entry => {
                                        const teacher = teachers.find(t => t.id === entry.teacher_id);
                                        return <div key={entry.id || `${entry.teacher_id}-${entry.subject}`} className="space-y-1 border-b border-slate-800 last:border-0 pb-1 last:pb-0">
                                          <div className="font-bold text-white text-sm">{entry.subject}</div>
                                          <div className="text-[10px] text-slate-400 bg-slate-950/50 py-1 px-2 rounded-md border border-slate-800 overflow-hidden text-ellipsis whitespace-nowrap">{teacher?.name || entry.teacher_id}</div>
                                        </div>;
                                      })}
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
                      Today's Timetable — {currentDateLabel}
                    </h3>
                    <p className="text-sm text-slate-400">Schedule updated with live covers and adjustments</p>
                  </div>

                  <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-800">
                            <th className="p-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest border-r border-slate-800 w-32">Today</th>
                            {[...Array(schoolConfig.num_periods || 9)].map((_, i) => (
                              <th key={i} className="p-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest border-r border-slate-800 last:border-0 min-w-[120px]">
                                Period {i + 1}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors">
                            <td className="p-4 font-bold text-indigo-400 border-r border-slate-800 text-sm whitespace-nowrap">
                              {currentDay}
                            </td>
                            {[...Array(schoolConfig.num_periods || 9)].map((_, i) => {
                              const periodNum = i + 1;
                              const todayDay = currentDay;
                              const slotEntries = masterTimetable.filter(e => e.class_name === selectedSection && e.day === todayDay && e.period_number === periodNum);
                              
                              // Check for adjustment (SILENT REPLACEMENT)
                              const adjustment = todayAdjustments.find(a => a.class_name === selectedSection && a.period_number === periodNum);
                              
                              return (
                                <td key={i} className="p-4 border-r border-slate-800 last:border-0 text-center min-w-[120px]">
                                  {slotEntries.length || adjustment ? (
                                    <div className="space-y-2">
                                      {slotEntries.map(entry => {
                                        const teacher = teachers.find(t => t.id === entry.teacher_id);
                                        return <div key={entry.id || `${entry.teacher_id}-${entry.subject}`} className="border-b border-slate-800 last:border-0 pb-1 last:pb-0">
                                          <div className="text-sm font-bold text-slate-100">{entry.subject}</div>
                                          <div className="text-xs text-indigo-400 font-medium">{teacher?.name || entry.teacher_id}</div>
                                        </div>;
                                      })}
                                      {!slotEntries.length && adjustment && <div><div className="text-sm font-bold text-slate-100">{adjustment.subject}</div><div className="text-xs text-indigo-400 font-medium">{adjustment.covering_teacher_name}</div></div>}
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
                      readOnly
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-400"
                    />
                    <p className="mt-1 text-xs text-slate-500">Set by the active bell schedule.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Recess After Period</label>
                    <input 
                      type="number" 
                      value={schoolConfig.recess_after_period ?? ''}
                      placeholder="Not set"
                      onChange={e => setSchoolConfig({...schoolConfig, recess_after_period: e.target.value === '' ? null : parseInt(e.target.value, 10)})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">School Operating Days</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {WEEKDAY_OPTIONS.map(day => (
                      <label key={day} className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={(schoolConfig.operating_days || []).includes(day)}
                          onChange={() => toggleOperatingDay(day)}
                          className="accent-indigo-500"
                        />
                        {day}
                      </label>
                    ))}
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
              <div className="space-y-3">
                <button onClick={previewAllocationSections} disabled={allocationLoading} className="px-4 py-2 bg-cyan-900/50 border border-cyan-700/50 text-cyan-200 rounded-xl disabled:opacity-50">
                  {allocationLoading ? 'Loading allocation…' : 'Load from allocation'}
                </button>
                {allocationError && <p role="alert" className="text-sm text-red-300">{allocationError}</p>}
                {allocationPreview && (
                  <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 space-y-3">
                    <p className="text-sm text-slate-300">Preview: {allocationPreview.length} sections will replace the current Class Names after confirmation.</p>
                    <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
                      {allocationPreview.map(section => <span key={section} className="rounded bg-slate-800 px-2 py-1 text-xs">{section}</span>)}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setSchoolConfig(previous => ({ ...previous, class_names: allocationPreview })); setAllocationPreview(null); }} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold">Confirm</button>
                      <button onClick={() => setAllocationPreview(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm">Cancel</button>
                    </div>
                  </div>
                )}
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
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                <button onClick={() => selectDirectoryTab('staff')} className={`px-4 py-2 rounded-lg ${directoryTab === 'staff' ? 'bg-indigo-600' : 'bg-slate-800'}`}>Staff directory</button>
                <button onClick={() => selectDirectoryTab('issues')} className={`px-4 py-2 rounded-lg ${directoryTab === 'issues' ? 'bg-indigo-600' : 'bg-slate-800'}`}>Issues</button>
              </div>
              {directoryTab === 'staff' && <button disabled={!staffWriteEnabled} onClick={() => setStaffDraft({ staff_code: '', full_name: '', department: '', roles: '', email: '', notes: '' })} className="px-4 py-2 bg-indigo-600 rounded-lg disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"><Plus size={16} className="inline mr-1" /> Add staff</button>}
            </div>
            {!staffWriteEnabled && <p className="rounded-xl border border-amber-700/40 bg-amber-950/30 p-3 text-sm text-amber-200">Editing is disabled because STAFF_WRITE_ENABLED is false.</p>}
            {directoryError && <p role="alert" className="rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">{directoryError}</p>}
            {directoryTab === 'staff' ? (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)] gap-5">
                <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                  <input aria-label="Search staff" placeholder="Search name, code, or email" value={directorySearch} onChange={event => setDirectorySearch(event.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2" />
                  <select aria-label="Filter department" value={directoryDepartment} onChange={event => setDirectoryDepartment(event.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                    <option value="">All departments</option>
                    {[...new Set(directoryStaff.map(row => row.department).filter(Boolean))].sort().map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                  {directoryLoading ? <p className="text-sm text-slate-400">Loading staff…</p> : directoryStaff.filter(row => {
                    const term = directorySearch.trim().toLowerCase();
                    return (!term || `${row.full_name} ${row.staff_code} ${row.email || ''}`.toLowerCase().includes(term)) && (!directoryDepartment || row.department === directoryDepartment);
                  }).map(row => (
                    <button key={row.id} onClick={() => openStaffDetail(row.id)} className={`w-full text-left rounded-xl border p-3 ${selectedStaff?.id === row.id ? 'border-indigo-500 bg-indigo-950/40' : 'border-slate-800 hover:bg-slate-800/60'}`}>
                      <div className="flex justify-between gap-2"><span className="font-medium">{row.full_name}</span><span className="text-xs text-indigo-300">{row.staff_code}</span></div>
                      <div className="mt-1 flex justify-between text-xs text-slate-400"><span>{row.department || 'No department'}</span><span>{row.assignment_count || 0} assignments</span></div>
                    </button>
                  ))}
                </section>
                <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                  {selectedStaff ? <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><p className="text-xs uppercase tracking-wide text-slate-500">{selectedStaff.staff_code}</p><h3 className="text-xl font-semibold">{selectedStaff.full_name}</h3><p className="text-sm text-slate-400">{selectedStaff.department || 'No department'} · {selectedStaff.is_active ? 'Active' : 'Inactive'}</p></div>
                      <div className="flex gap-2"><button disabled={!staffWriteEnabled} onClick={() => setStaffDraft({ ...selectedStaff, roles: (selectedStaff.roles || []).join(', ') })} className="px-3 py-2 bg-slate-800 rounded-lg disabled:text-slate-500 disabled:cursor-not-allowed"><Edit2 size={15} className="inline mr-1" /> Edit</button><button disabled={!staffWriteEnabled || !selectedStaff.is_active} onClick={() => deactivateStaff(selectedStaff.id)} className="px-3 py-2 bg-red-950/60 text-red-200 rounded-lg disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed">Deactivate</button></div>
                    </div>
                    <div className="flex flex-wrap gap-2">{(selectedStaff.roles || []).map(role => <span key={role} className="rounded-full bg-violet-950/70 px-3 py-1 text-xs text-violet-200">{role}</span>)}{selectedStaff.email && <span className="text-sm text-slate-400">{selectedStaff.email}</span>}</div>
                    <div className="flex items-center justify-between"><h4 className="font-semibold">Assignments</h4><button disabled={!staffWriteEnabled} onClick={() => setAssignmentDraft({ subject: '', target_type: 'section', sections: '', periods_per_week: '', raw_text: '' })} className="px-3 py-1.5 bg-indigo-600 rounded-lg text-sm disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"><Plus size={14} className="inline mr-1" /> Add assignment</button></div>
                    {(selectedStaff.assignments || []).length ? selectedStaff.assignments.map(item => <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium">{item.subject || 'Unspecified subject'} <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${item.target_type === 'unparsed' ? 'bg-amber-950 text-amber-200' : item.target_type === 'optional_group' ? 'bg-cyan-950 text-cyan-200' : item.target_type === 'combined_group' ? 'bg-violet-950 text-violet-200' : 'bg-slate-800 text-slate-300'}`}>{item.target_type.replace('_', ' ')}</span></div><div className="flex gap-2"><button disabled={!staffWriteEnabled} onClick={() => setAssignmentDraft({ ...item, sections: (item.sections || []).join(', '), periods_per_week: item.periods_per_week ?? '', raw_text: item.raw_text || '' })} className="text-indigo-300 disabled:text-slate-600 disabled:cursor-not-allowed"><Edit2 size={15} /></button><button disabled={!staffWriteEnabled} onClick={() => removeAssignment(item.id)} className="text-red-300 disabled:text-slate-600 disabled:cursor-not-allowed"><Trash2 size={15} /></button></div></div>
                      <p className="mt-2 text-sm text-slate-400">Sections: {(item.sections || []).join(', ') || '—'} · {item.periods_per_week ?? 'Unspecified'} periods/week</p>
                      {item.raw_text && <p className="mt-1 text-xs text-slate-500">Source: {item.raw_text}</p>}
                    </article>) : <p className="text-sm text-slate-400">No allocation assignments.</p>}
                  </> : <p className="text-sm text-slate-400">Select a staff member to view their details.</p>}
                </section>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h3 className="font-semibold mb-3">Staff with no assignments</h3>{!issues ? <p className="text-sm text-slate-400">Loading issues…</p> : issues.staff_without_assignments.length ? issues.staff_without_assignments.map(row => <p key={row.id} className="py-2 border-b border-slate-800">{row.full_name} <span className="text-xs text-slate-500">{row.staff_code} · {row.department || 'No department'}</span></p>) : <p className="text-sm text-slate-400">None found.</p>}</section>
                <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h3 className="font-semibold mb-3">Unparsed assignment rows</h3>{!issues ? <p className="text-sm text-slate-400">Loading issues…</p> : issues.unparsed_assignments.length ? issues.unparsed_assignments.map(row => <article key={row.id} className="py-2 border-b border-slate-800"><p>{row.subject || 'Unspecified subject'} · {row.sections?.join(', ') || 'No parsed sections'}</p><p className="text-xs text-amber-200">{row.raw_text || 'No source text'}</p></article>) : <p className="text-sm text-slate-400">None found.</p>}</section>
              </div>
            )}
            {staffDraft && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"><form onSubmit={event => { event.preventDefault(); saveStaffDraft(); }} className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-3"><h3 className="text-lg font-semibold">{staffDraft.id ? 'Edit staff' : 'Add staff'}</h3>{[['staff_code', 'Staff code'], ['full_name', 'Full name'], ['department', 'Department'], ['roles', 'Roles (comma separated)'], ['email', 'Email'], ['notes', 'Notes']].map(([key, label]) => <label key={key} className="block text-sm text-slate-400">{label}<input disabled={!staffWriteEnabled} value={staffDraft[key] || ''} onChange={event => setStaffDraft({ ...staffDraft, [key]: event.target.value })} required={['staff_code', 'full_name'].includes(key)} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed" /></label>)}<div className="flex justify-end gap-2"><button type="button" onClick={() => setStaffDraft(null)} className="px-4 py-2 bg-slate-800 rounded-lg">Cancel</button><button disabled={!staffWriteEnabled} className="px-4 py-2 bg-indigo-600 rounded-lg disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed">Save</button></div></form></div>}
            {assignmentDraft && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"><form onSubmit={event => { event.preventDefault(); saveAssignmentDraft(); }} className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-3"><h3 className="text-lg font-semibold">{assignmentDraft.id ? 'Edit assignment' : 'Add assignment'}</h3><label className="block text-sm text-slate-400">Subject<input disabled={!staffWriteEnabled} value={assignmentDraft.subject || ''} onChange={event => setAssignmentDraft({ ...assignmentDraft, subject: event.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed" /></label><label className="block text-sm text-slate-400">Target type<select disabled={!staffWriteEnabled} value={assignmentDraft.target_type} onChange={event => setAssignmentDraft({ ...assignmentDraft, target_type: event.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed">{['section', 'combined_group', 'optional_group', 'unparsed'].map(value => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}</select></label><label className="block text-sm text-slate-400">Sections (comma separated)<input disabled={!staffWriteEnabled} value={assignmentDraft.sections || ''} onChange={event => setAssignmentDraft({ ...assignmentDraft, sections: event.target.value })} placeholder="8A, 8B or OPT11" className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed" /></label><label className="block text-sm text-slate-400">Periods per week<input disabled={!staffWriteEnabled} type="number" min="0" value={assignmentDraft.periods_per_week} onChange={event => setAssignmentDraft({ ...assignmentDraft, periods_per_week: event.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed" /></label><label className="block text-sm text-slate-400">Source / ambiguous text<textarea disabled={!staffWriteEnabled} value={assignmentDraft.raw_text || ''} onChange={event => setAssignmentDraft({ ...assignmentDraft, raw_text: event.target.value })} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setAssignmentDraft(null)} className="px-4 py-2 bg-slate-800 rounded-lg">Cancel</button><button disabled={!staffWriteEnabled} className="px-4 py-2 bg-indigo-600 rounded-lg disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed">Save</button></div></form></div>}
          </div>
        )}

        {/* --- SECTION: TIMETABLE BUILDER --- */}
        {activeTab === 'timetable' && (
          <div className="space-y-6">
            {allocationReview && (
              <div role="status" className="rounded-2xl border border-amber-700/50 bg-amber-950/30 p-5 text-sm text-amber-100">
                <p className="font-semibold">Allocation review: subject groups can run in parallel.</p>
                <p className="mt-1">Allocation totals add lessons across student groups, so they can exceed the {allocationReview.capacity_per_section} clock periods available each week. The builder supports multiple subjects in one class-period. {allocationReview.unparsed_assignment_count} rows are unparsed, {allocationReview.unknown_period_count} parsed rows lack a weekly count, and {allocationReview.optional_assignment_count} optional-group rows still need their option timetable rule.</p>
                <p className="mt-2">Each lesson below uses its allocated teacher and subject. A teacher cannot be assigned to two lessons at the same time.</p>
              </div>
            )}
            <div className="flex justify-between items-center bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
              <div className="flex gap-4 items-center">
                <span className="text-sm font-medium text-slate-400">Target Day:</span>
                <select value={builderDay} onChange={e => setBuilderDay(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 focus:outline-none">
                  {(schoolConfig.operating_days || []).map(d => <option key={d} value={d}>{d}</option>)}
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
                    {Array.from({ length: schoolConfig.num_periods || 9 }).map((_, i) => (
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
                        <span>{cls}</span>
                        {allocationReview && <span className="block text-[10px] font-normal text-slate-500">{allocationReview.parallel_group_periods_by_section?.[cls] || 0} allocated group-periods</span>}
                      </td>
                      {Array.from({ length: schoolConfig.num_periods || 9 }).map((_, i) => {
                        const pNum = i + 1;
                        const day = builderDay;
                        const key = JSON.stringify([cls, pNum, day]);
                        const choices = builderData[key] ?? [''];
                        
                        return (
                          <td key={i} className={`p-2 min-w-[190px] border-r border-slate-800/30 ${!choices.some(Boolean) ? 'bg-red-500/5' : ''}`}>
                            <div className="space-y-1.5">
                              {choices.map((choice, choiceIndex) => <div key={`${key}-${choiceIndex}`} className="flex items-center gap-1">
                                <select
                                  value={choice || ''}
                                  onChange={e => updateBuilderChoice(key, choiceIndex, e.target.value)}
                                  className={`min-w-0 flex-1 bg-slate-950 border text-xs rounded-lg p-2 focus:outline-none transition-all ${!choice ? 'border-red-500/30 italic text-slate-500' : 'border-slate-800 text-slate-200'}`}
                                >
                                  <option value="">-- Assign subject group --</option>
                                  {(allocationReview?.assignment_options_by_section?.[cls] || []).map((option, optionIndex) => {
                                    const alreadyUsedByAnotherGroup = choices.some((selected, selectedIndex) => {
                                      if (!selected || selectedIndex === choiceIndex) return false;
                                      try { return JSON.parse(selected)[1] === option.subject; } catch { return false; }
                                    });
                                    return <option disabled={alreadyUsedByAnotherGroup} key={`${option.staff_code}-${option.subject}-${optionIndex}`} value={JSON.stringify([option.staff_code, option.subject])}>{option.full_name} — {option.subject} ({option.staff_code})</option>;
                                  })}
                                </select>
                              </div>)}
                              <button type="button" onClick={() => setBuilderData(current => ({ ...current, [key]: [...(current[key] || []), ''] }))} className="text-[10px] text-indigo-300 hover:text-indigo-200">+ Add parallel subject</button>
                            </div>
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
                  { text: `Master Timetable updated for ${currentDay}`, time: '2 mins ago', type: 'update' },
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
