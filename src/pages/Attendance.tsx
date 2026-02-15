import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Attendance as AttendanceType, Profile } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Clock, LogIn, LogOut, Calendar, Users, AlertCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AttendanceWithProfile {
  id: string;
  user_id: string;
  clock_in: string;
  clock_out: string | null;
  date: string;
  profile?: Profile;
}

export default function Attendance() {
  const { user, isAdmin, isAttendanceManager } = useAuth();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceWithProfile[]>([]);
  const [monthlyAttendance, setMonthlyAttendance] = useState<AttendanceWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const canManage = isAdmin || isAttendanceManager;
  const today = new Date().toISOString().split('T')[0];
  const currentHour = new Date().getHours();
  const showAbsentees = currentHour >= 9; // Show absentees after 9 AM

  useEffect(() => {
    fetchData();
  }, [user, selectedMonth]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    // Fetch all employees
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name');

    if (profilesData) {
      setEmployees(profilesData as Profile[]);
    }

    // Fetch today's attendance
    const { data: todayData } = await supabase
      .from('attendance')
      .select('*')
      .eq('date', today);

    if (todayData) {
      setTodayAttendance(todayData as AttendanceWithProfile[]);
    }

    // Fetch monthly attendance
    const [year, month] = selectedMonth.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

    const { data: monthlyData } = await supabase
      .from('attendance')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (monthlyData) {
      setMonthlyAttendance(monthlyData as AttendanceWithProfile[]);
    }

    setLoading(false);
  };

  const clockInEmployee = async (employeeId: string) => {
    const { error } = await supabase.from('attendance').insert({
      user_id: employeeId,
      date: today,
      clock_in: new Date().toISOString()
    });

    if (error) {
      if (error.code === '23505') {
        toast({ title: 'Already Clocked In', description: 'This employee has already clocked in today', variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
    } else {
      toast({ title: 'Clocked In', description: `Clock-in recorded at ${new Date().toLocaleTimeString()}` });
      fetchData();
    }
  };

  const clockOutEmployee = async (attendanceId: string) => {
    const { error } = await supabase
      .from('attendance')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', attendanceId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Clocked Out', description: `Clock-out recorded at ${new Date().toLocaleTimeString()}` });
      fetchData();
    }
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const calculateHours = (clockIn: string, clockOut: string | null) => {
    if (!clockOut) return '-';
    const diff = new Date(clockOut).getTime() - new Date(clockIn).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  // Calculate absentees (employees who haven't clocked in today after 9 AM)
  const absentees = useMemo(() => {
    if (!showAbsentees) return [];
    const clockedInIds = new Set(todayAttendance.map(a => a.user_id));
    return employees.filter(emp => !clockedInIds.has(emp.user_id));
  }, [employees, todayAttendance, showAbsentees]);

  // Calculate monthly summary with absent days
  const monthlySummary = useMemo(() => {
    const [year, month] = selectedMonth.split('-');
    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
    const currentDate = new Date();
    const isCurrentMonth = currentDate.getFullYear() === parseInt(year) && 
                           currentDate.getMonth() + 1 === parseInt(month);
    const workingDays = isCurrentMonth ? currentDate.getDate() : daysInMonth;

    return employees.map(emp => {
      const empAttendance = monthlyAttendance.filter(a => a.user_id === emp.user_id);
      const presentDays = new Set(empAttendance.map(a => a.date)).size;
      const absentDays = workingDays - presentDays;
      
      return {
        ...emp,
        presentDays,
        absentDays,
        hasAbsences: absentDays > 0
      };
    });
  }, [employees, monthlyAttendance, selectedMonth]);

  // Get employee's today attendance record
  const getEmployeeAttendance = (employeeId: string) => {
    return todayAttendance.find(a => a.user_id === employeeId);
  };

  // Generate month options (last 12 months)
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
      options.push({ value, label });
    }
    return options;
  }, []);

  if (!canManage) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        You don't have permission to access this page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Staff Attendance</h1>
        <p className="text-slate-400">Manage employee clock-in and clock-out</p>
      </div>

      {/* Absentees Alert (after 9 AM) */}
      {showAbsentees && absentees.length > 0 && (
        <Card className="bg-red-900/20 border-red-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-red-400">
              <AlertCircle className="h-5 w-5" />
              Absentees Today ({absentees.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {absentees.map(emp => (
                <Badge key={emp.id} variant="destructive" className="text-sm">
                  {emp.full_name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Attendance - All Employees */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Users className="h-5 w-5" />
            Today - {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400">Employee</TableHead>
                <TableHead className="text-slate-400">Phone</TableHead>
                <TableHead className="text-slate-400">Clock In</TableHead>
                <TableHead className="text-slate-400">Clock Out</TableHead>
                <TableHead className="text-slate-400">Hours</TableHead>
                <TableHead className="text-slate-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map(emp => {
                const attendance = getEmployeeAttendance(emp.user_id);
                const isAbsent = showAbsentees && !attendance;
                
                return (
                  <TableRow key={emp.id} className={`border-slate-700 ${isAbsent ? 'bg-red-900/10' : ''}`}>
                    <TableCell className="text-white font-medium">
                      {emp.full_name}
                      {isAbsent && (
                        <Badge variant="destructive" className="ml-2 text-xs">Absent</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-300">{emp.phone || '-'}</TableCell>
                    <TableCell className="text-slate-300">
                      {attendance ? formatTime(attendance.clock_in) : '-'}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {attendance ? formatTime(attendance.clock_out) : '-'}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {attendance ? calculateHours(attendance.clock_in, attendance.clock_out) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!attendance && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => clockInEmployee(emp.user_id)}>
                            <LogIn className="h-4 w-4 mr-1" />
                            Clock In
                          </Button>
                        )}
                        {attendance && !attendance.clock_out && (
                          <Button size="sm" variant="destructive" onClick={() => clockOutEmployee(attendance.id)}>
                            <LogOut className="h-4 w-4 mr-1" />
                            Clock Out
                          </Button>
                        )}
                        {attendance?.clock_out && (
                          <Badge className="bg-green-600">Completed</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                    {loading ? 'Loading...' : 'No employees found'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Monthly Summary */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-white">
              <Calendar className="h-5 w-5" />
              Monthly Summary
            </CardTitle>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-48 bg-slate-700 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400">Employee</TableHead>
                <TableHead className="text-slate-400">Phone</TableHead>
                <TableHead className="text-slate-400">Present Days</TableHead>
                <TableHead className="text-slate-400">Absent Days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlySummary.map(emp => (
                <TableRow 
                  key={emp.id} 
                  className={`border-slate-700 ${emp.hasAbsences ? 'bg-red-900/20' : ''}`}
                >
                  <TableCell className={`font-medium ${emp.hasAbsences ? 'text-red-400' : 'text-white'}`}>
                    {emp.full_name}
                  </TableCell>
                  <TableCell className="text-slate-300">{emp.phone || '-'}</TableCell>
                  <TableCell className="text-green-400">{emp.presentDays}</TableCell>
                  <TableCell>
                    {emp.hasAbsences ? (
                      <Badge variant="destructive">{emp.absentDays} days</Badge>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}