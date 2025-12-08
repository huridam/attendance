import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, deleteDoc, setDoc, addDoc } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { db, auth } from '../firebase';
import LoadingSpinner from '../components/LoadingSpinner';
import { useStudentContext } from '../context/StudentContext';
import { format, startOfMonth, endOfMonth, getDaysInMonth, parse, getDay } from 'date-fns';
import { Download, Loader2, Calendar as CalendarIcon, X, CalendarDays, Edit, Trash2, Save } from 'lucide-react';

function Dashboard() {
  const [user] = useAuthState(auth);
  const [date, setDate] = useState(new Date());
  const [activeMonth, setActiveMonth] = useState(new Date());
  const [attendanceDates, setAttendanceDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [showMonthlyView, setShowMonthlyView] = useState(false);
  const [monthlyRecords, setMonthlyRecords] = useState([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [showStudentView, setShowStudentView] = useState(false);
  const [studentRecords, setStudentRecords] = useState([]);
  const [loadingStudent, setLoadingStudent] = useState(false);
  const [showAttendanceDetail, setShowAttendanceDetail] = useState(false);
  const [selectedDateForDetail, setSelectedDateForDetail] = useState(null);
  const [attendanceDetailRecords, setAttendanceDetailRecords] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEditStudentModal, setShowEditStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editingStudentData, setEditingStudentData] = useState(null);
  const [savingStudentEdit, setSavingStudentEdit] = useState(false);
  const [deletingStudentRecord, setDeletingStudentRecord] = useState(null);
  const navigate = useNavigate();
  const monthKey = format(activeMonth, 'yyyy-MM');
  const attendanceDateSet = useMemo(() => new Set(attendanceDates), [attendanceDates]);
  const { studentsLoading, hasStudents, selectedClass, schoolId } = useStudentContext();

  const loadAttendanceDates = useCallback(
    async (targetDate) => {
      if (!user || !targetDate || !selectedClass || !schoolId) {
        setAttendanceDates([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const monthStart = format(startOfMonth(targetDate), 'yyyy-MM-dd');
        const monthEnd = format(endOfMonth(targetDate), 'yyyy-MM-dd');
        const attendanceQuery = query(
          collection(db, 'attendance'),
          where('schoolId', '==', schoolId),
          where('className', '==', selectedClass),
          where('date', '>=', monthStart),
          where('date', '<=', monthEnd)
        );
        const querySnapshot = await getDocs(attendanceQuery);
        const dates = new Set();
        querySnapshot.forEach((docSnap) => {
          if (!docSnap || !docSnap.exists()) return;
          
          const data = docSnap.data();
          if (!data) return;
          
          // 문서 ID가 날짜 형식인 경우 (예: YYYY-MM-DD)
          const docId = docSnap.id;
          if (docId && typeof docId === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(docId.trim())) {
            const normalizedDate = docId.trim();
            dates.add(normalizedDate);
          }
          
          // data.date 필드가 있는 경우
          if (data.date && typeof data.date === 'string') {
            const dateStr = data.date.trim();
            // YYYY-MM-DD 형식 검증
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
              dates.add(dateStr);
            }
          }
        });
        
        // 배열로 변환 및 정렬 (날짜 형식 검증)
        const uniqueDates = Array.from(dates)
          .filter((dateStr) => {
            // YYYY-MM-DD 형식인지 최종 검증
            return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
          })
          .sort();
        
        setAttendanceDates(uniqueDates);
        console.log('출석 기록 날짜 (로드됨):', uniqueDates);
        console.log('현재 activeMonth:', format(targetDate, 'yyyy-MM'));
      } catch (err) {
        if (err?.code === 'failed-precondition') {
          console.warn('Firestore 복합 인덱스가 필요합니다. 콘솔 링크:', err?.message);
          // 인덱스 오류가 발생해도 빈 배열로 설정하여 앱이 멈추지 않도록 함
          setAttendanceDates([]);
        } else {
          console.error('출석 기록 로드 오류:', err);
          setAttendanceDates([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [user, selectedClass, schoolId]
  );

  useEffect(() => {
    if (user) {
      loadAttendanceDates(activeMonth);
    } else {
      setLoading(false);
    }
  }, [user, monthKey, loadAttendanceDates, activeMonth, selectedClass]);

  const formatDateValue = useCallback((value) => {
    if (!value) return '';
    try {
      return format(value, 'yyyy-MM-dd');
    } catch (err) {
      console.error('날짜 포맷 오류:', err);
      return '';
    }
  }, []);

  const handleDateChange = async (newDate) => {
    setDate(newDate);
    const dateStr = formatDateValue(newDate);
    
    // 출석 기록이 있는지 확인
    if (hasAttendanceOnDate(newDate)) {
      // 기록이 있으면 상세 모달 열기
      await loadAttendanceDetail(dateStr);
      setSelectedDateForDetail(dateStr);
      setShowAttendanceDetail(true);
    } else {
      // 기록이 없으면 기존처럼 입력 페이지로 이동
      navigate(`/attendance/${dateStr}`);
    }
  };

  const handleActiveStartDateChange = useCallback(
    ({ activeStartDate }) => {
      if (activeStartDate) {
        const newMonth = new Date(activeStartDate);
        setActiveMonth(newMonth);
        // 월이 변경되면 해당 월의 출석 데이터 로드
        loadAttendanceDates(newMonth);
      }
    },
    [loadAttendanceDates]
  );

  const handleDownload = useCallback(async () => {
    if (!user || !selectedClass || !schoolId) {
      alert('학급을 선택해주세요.');
      return;
    }

    setDownloading(true);
    try {
      // 모든 출석 기록 조회
      const attendanceQuery = query(
        collection(db, 'attendance'),
        where('schoolId', '==', schoolId),
        where('className', '==', selectedClass)
      );
      const querySnapshot = await getDocs(attendanceQuery);

      // 학생 정보 조회
      const studentsQuery = query(
        collection(db, 'students'),
        where('schoolId', '==', schoolId),
        where('className', '==', selectedClass)
      );
      const studentsSnapshot = await getDocs(studentsQuery);
      const studentsMap = new Map();
      studentsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data && doc.id) {
          studentsMap.set(doc.id, {
            number: data.number || '',
            name: data.name || '',
          });
        }
      });

      // 출석 기록 데이터 구성 (이상 기록만 필터링)
      const records = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.records && Array.isArray(data.records)) {
          data.records.forEach((record) => {
            // '출석' 상태는 제외하고, 이상 기록만 포함
            if (record && record.studentId && record.status && record.status !== '출석') {
              const studentInfo = studentsMap.get(record.studentId);
              records.push({
                studentNumber: studentInfo?.number || record.studentNumber || '',
                studentName: studentInfo?.name || record.studentName || '',
                date: data.date || docSnap.id || '',
                className: data.className || selectedClass,
                status: record.status || '',
                reason: record.reason || '',
                periods: record.periods && Array.isArray(record.periods) && record.periods.length > 0
                  ? record.periods.join(', ')
                  : '',
                memo: record.memo || '',
              });
            }
          });
        }
      });

      // 데이터가 없으면 알림
      if (records.length === 0) {
        alert('다운로드할 이상 출석 기록이 없습니다. (출석 상태는 제외됩니다)');
        setDownloading(false);
        return;
      }

      // 날짜순으로 정렬
      records.sort((a, b) => {
        if (a.date !== b.date) {
          return (a.date || '').localeCompare(b.date || '');
        }
        const numA = Number(a.studentNumber) || 0;
        const numB = Number(b.studentNumber) || 0;
        return numA - numB;
      });

      // CSV 헤더와 데이터 매핑 (순서: 학급명, 날짜, 학생번호, 학생이름, 출석상태, 결석사유, 교시, 비고)
      const headers = ['학급명', '날짜', '학생번호', '학생이름', '출석상태', '결석사유', '교시', '비고'];
      const headerMap = {
        학급명: 'className',
        날짜: 'date',
        학생번호: 'studentNumber',
        학생이름: 'studentName',
        출석상태: 'status',
        결석사유: 'reason',
        교시: 'periods',
        비고: 'memo',
      };

      // CSV 행 생성
      const csvRows = [
        headers.join(','),
        ...records.map((record) =>
          headers
            .map((header) => {
              const key = headerMap[header];
              const value = String(record[key] || '');
              // CSV 이스케이프 처리
              if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
                return `"${value.replace(/"/g, '""')}"`;
              }
              return value;
            })
            .join(',')
        ),
      ];

      const csvContent = csvRows.join('\n');

      // BOM 추가 (한글 깨짐 방지)
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fileName = `출석기록_${selectedClass}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('다운로드 오류:', err);
      alert(`출석 기록 다운로드 중 오류가 발생했습니다: ${err.message || err.toString()}`);
    } finally {
      setDownloading(false);
    }
  }, [user, selectedClass, schoolId]);

  // 월별 출석 기록 로드
  const loadMonthlyRecords = useCallback(async () => {
    if (!user || !selectedClass || !schoolId || !activeMonth) {
      setMonthlyRecords([]);
      return;
    }

    setLoadingMonthly(true);
    try {
      const monthStart = format(startOfMonth(activeMonth), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(activeMonth), 'yyyy-MM-dd');
      
      // 출석 기록 조회
      const attendanceQuery = query(
        collection(db, 'attendance'),
        where('schoolId', '==', schoolId),
        where('className', '==', selectedClass),
        where('date', '>=', monthStart),
        where('date', '<=', monthEnd)
      );
      const attendanceSnapshot = await getDocs(attendanceQuery);

      // 학생 정보 조회
      const studentsQuery = query(
        collection(db, 'students'),
        where('schoolId', '==', schoolId),
        where('className', '==', selectedClass)
      );
      const studentsSnapshot = await getDocs(studentsQuery);
      const studentsMap = new Map();
      studentsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data && doc.id) {
          studentsMap.set(doc.id, {
            number: data.number || 0,
            name: data.name || '',
          });
        }
      });

      // 날짜별로 기록 정리
      const recordsByDate = new Map();
      const daysInMonth = getDaysInMonth(activeMonth);
      
      // 1일부터 마지막 날까지 초기화
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = format(new Date(activeMonth.getFullYear(), activeMonth.getMonth(), day), 'yyyy-MM-dd');
        recordsByDate.set(dateStr, []);
      }

      // 출석 기록 처리
      attendanceSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.records && Array.isArray(data.records)) {
          const dateStr = data.date || docSnap.id;
          if (recordsByDate.has(dateStr)) {
            data.records.forEach((record) => {
              if (record && record.studentId) {
                const studentInfo = studentsMap.get(record.studentId);
                recordsByDate.get(dateStr).push({
                  studentNumber: studentInfo?.number || record.studentNumber || 0,
                  studentName: studentInfo?.name || record.studentName || '',
                  status: record.status || '출석',
                  reason: record.reason || '',
                  periods: record.periods && Array.isArray(record.periods) ? record.periods : [],
                  memo: record.memo || '',
                });
              }
            });
          }
        }
      });

      // 배열로 변환 및 정렬 (모든 날짜 포함, 이상 기록 요약)
      const recordsList = Array.from(recordsByDate.entries())
        .map(([date, records]) => {
          const day = parseInt(date.split('-')[2]);
          const month = activeMonth.getMonth() + 1;
          
          // 이상 기록만 필터링
          const abnormalRecords = records.filter(record => record.status !== '출석');
          
          // 상태별로 그룹화
          const recordsByStatus = new Map();
          abnormalRecords.forEach(record => {
            const status = record.status || '기타';
            if (!recordsByStatus.has(status)) {
              recordsByStatus.set(status, []);
            }
            recordsByStatus.get(status).push(record);
          });
          
          // 요약 텍스트 생성
          let summary = '';
          if (abnormalRecords.length === 0) {
            summary = '이상 없음';
          } else {
            const summaryParts = [];
            recordsByStatus.forEach((statusRecords, status) => {
              const count = statusRecords.length;
              const students = statusRecords
                .sort((a, b) => (a.studentNumber || 0) - (b.studentNumber || 0))
                .map(r => `${r.studentNumber}번 ${r.studentName}`)
                .join(', ');
              summaryParts.push(`${status} ${count}명 (${students})`);
            });
            summary = summaryParts.join(', ');
          }
          
          return {
            date,
            day,
            month,
            summary,
            abnormalCount: abnormalRecords.length,
          };
        })
        .sort((a, b) => a.day - b.day);

      setMonthlyRecords(recordsList);
    } catch (err) {
      console.error('월별 기록 로드 오류:', err);
      setMonthlyRecords([]);
    } finally {
      setLoadingMonthly(false);
    }
  }, [user, selectedClass, schoolId, activeMonth]);

  // 월별 기록 보기 버튼 클릭
  const handleShowMonthlyView = useCallback(() => {
    setShowMonthlyView(true);
    loadMonthlyRecords();
  }, [loadMonthlyRecords]);

  // 학생별 기록 로드
  const loadStudentRecords = useCallback(async () => {
    if (!user || !selectedClass || !schoolId || !activeMonth) {
      setStudentRecords([]);
      return;
    }

    setLoadingStudent(true);
    try {
      const monthStart = format(startOfMonth(activeMonth), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(activeMonth), 'yyyy-MM-dd');

      // 출석 기록 조회
      const attendanceQuery = query(
        collection(db, 'attendance'),
        where('schoolId', '==', schoolId),
        where('className', '==', selectedClass),
        where('date', '>=', monthStart),
        where('date', '<=', monthEnd)
      );
      const attendanceSnapshot = await getDocs(attendanceQuery);

      // 학생 정보 조회
      const studentsQuery = query(
        collection(db, 'students'),
        where('schoolId', '==', schoolId),
        where('className', '==', selectedClass)
      );
      const studentsSnapshot = await getDocs(studentsQuery);
      const studentsMap = new Map();
      studentsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data && doc.id) {
          studentsMap.set(doc.id, {
            number: data.number || 0,
            name: data.name || '',
          });
        }
      });

      // 모든 학생 초기화
      const recordsByStudent = new Map();
      studentsMap.forEach((studentInfo, studentId) => {
        recordsByStudent.set(studentId, {
          studentId,
          number: studentInfo.number || 0,
          name: studentInfo.name || '',
          late: [],
          earlyLeave: [],
          absent: [],
        });
      });

      // 출석 기록에서 이상 기록만 집계
      attendanceSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.records && Array.isArray(data.records)) {
          const dateStr = data.date || docSnap.id;
          // 날짜를 M/d 형식으로 변환 (예: 11/5)
          const dateObj = parse(dateStr, 'yyyy-MM-dd', new Date());
          const formattedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

          data.records.forEach((record) => {
            if (record && record.studentId && record.status !== '출석') {
              const studentId = record.studentId;
              const studentRecord = recordsByStudent.get(studentId);
              
              if (!studentRecord) return;

              if (record.status === '지각') {
                studentRecord.late.push(formattedDate);
              } else if (record.status === '조퇴') {
                studentRecord.earlyLeave.push(formattedDate);
              } else if (record.status === '결석') {
                studentRecord.absent.push(formattedDate);
              }
            }
          });
        }
      });

      // 배열로 변환 및 정렬 (학생 번호 순)
      const recordsList = Array.from(recordsByStudent.values())
        .sort((a, b) => (a.number || 0) - (b.number || 0));

      setStudentRecords(recordsList);
    } catch (err) {
      console.error('학생별 기록 로드 오류:', err);
      setStudentRecords([]);
    } finally {
      setLoadingStudent(false);
    }
  }, [user, selectedClass, schoolId, activeMonth]);

  // 학생별 기록 보기 버튼 클릭
  const handleShowStudentView = useCallback(() => {
    setShowStudentView(true);
    loadStudentRecords();
  }, [loadStudentRecords]);

  // 오늘 버튼 클릭
  const handleTodayClick = useCallback(() => {
    const today = new Date();
    setActiveMonth(today);
    setDate(today);
    loadAttendanceDates(today);
  }, [loadAttendanceDates]);

  // 출석 기록 상세 로드
  const loadAttendanceDetail = useCallback(async (dateStr) => {
    if (!user || !dateStr || !selectedClass || !schoolId) {
      setAttendanceDetailRecords([]);
      return;
    }
    setLoadingDetail(true);
    try {
      const docId = `${schoolId}-${selectedClass}-${dateStr}`;
      const attendanceDocRef = doc(db, 'attendance', docId);
      const attendanceDoc = await getDoc(attendanceDocRef);
      
      if (attendanceDoc.exists()) {
        const data = attendanceDoc.data();
        if (data.records && Array.isArray(data.records)) {
          // 학생 번호 순으로 정렬
          const sortedRecords = [...data.records].sort((a, b) => {
            const numA = a.studentNumber || 0;
            const numB = b.studentNumber || 0;
            return numA - numB;
          });
          setAttendanceDetailRecords(sortedRecords);
        } else {
          setAttendanceDetailRecords([]);
        }
      } else {
        setAttendanceDetailRecords([]);
      }
    } catch (err) {
      console.error('출석 기록 상세 로드 오류:', err);
      setAttendanceDetailRecords([]);
    } finally {
      setLoadingDetail(false);
    }
  }, [user, selectedClass, schoolId]);

  // 출석 기록 삭제
  const handleDeleteAttendance = useCallback(async () => {
    if (!user || !selectedDateForDetail || !selectedClass || !schoolId) return;
    
    // 날짜 포맷팅 (yyyy-MM-dd -> yyyy년 M월 d일)
    let formattedDate = selectedDateForDetail;
    try {
      const dateObj = new Date(selectedDateForDetail.replace(/-/g, '/'));
      formattedDate = format(dateObj, 'yyyy년 M월 d일');
    } catch (err) {
      console.error('날짜 포맷 오류:', err);
    }
    
    if (!window.confirm(`정말로 ${formattedDate}의 출석 기록을 삭제하시겠습니까?`)) {
      return;
    }
    
    setDeleting(true);
    try {
      const docId = `${schoolId}-${selectedClass}-${selectedDateForDetail}`;
      const attendanceDocRef = doc(db, 'attendance', docId);
      await deleteDoc(attendanceDocRef);
      
      // 모달 닫기 및 목록 새로고침
      setShowAttendanceDetail(false);
      setSelectedDateForDetail(null);
      setAttendanceDetailRecords([]);
      
      // 출석 날짜 목록 새로고침
      await loadAttendanceDates(activeMonth);
      
      alert('출석 기록이 삭제되었습니다.');
    } catch (err) {
      console.error('출석 기록 삭제 오류:', err);
      alert('출석 기록 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  }, [user, selectedDateForDetail, selectedClass, schoolId, activeMonth, loadAttendanceDates]);

  // 수정 버튼 클릭
  const handleEditAttendance = useCallback(() => {
    if (selectedDateForDetail) {
      setShowAttendanceDetail(false);
      navigate(`/attendance/${selectedDateForDetail}`);
    }
  }, [selectedDateForDetail, navigate]);

  // 개별 학생 수정 모달 열기
  const handleEditStudent = useCallback((studentRecord) => {
    setEditingStudent(studentRecord);
    setEditingStudentData({
      status: studentRecord.status || '출석',
      reason: studentRecord.reason || '',
      periods: studentRecord.periods && Array.isArray(studentRecord.periods) ? [...studentRecord.periods] : [],
      memo: studentRecord.memo || '',
    });
    setShowEditStudentModal(true);
  }, []);

  // 개별 학생 수정 저장
  const handleSaveStudentEdit = useCallback(async () => {
    if (!user || !selectedDateForDetail || !selectedClass || !schoolId || !editingStudent) return;

    // 유효성 검사
    if (editingStudentData.status !== '출석') {
      if (!editingStudentData.reason) {
        alert('사유를 선택해주세요.');
        return;
      }
      if (['지각', '조퇴', '결과'].includes(editingStudentData.status) && editingStudentData.periods.length === 0) {
        alert('교시를 선택해주세요.');
        return;
      }
    }

    setSavingStudentEdit(true);
    try {
      const docId = `${schoolId}-${selectedClass}-${selectedDateForDetail}`;
      const attendanceDocRef = doc(db, 'attendance', docId);
      const attendanceDoc = await getDoc(attendanceDocRef);

      if (!attendanceDoc.exists()) {
        alert('출석 기록을 찾을 수 없습니다.');
        return;
      }

      const data = attendanceDoc.data();
      const records = data.records || [];

      // 해당 학생의 기록 찾아서 업데이트
      const updatedRecords = records.map((record) => {
        if (record.studentId === editingStudent.studentId) {
          return {
            ...record,
            status: editingStudentData.status,
            reason: editingStudentData.status !== '출석' ? editingStudentData.reason : '',
            periods: ['지각', '조퇴', '결과'].includes(editingStudentData.status) ? editingStudentData.periods : [],
            memo: editingStudentData.memo || '',
          };
        }
        return record;
      });

      // Firestore 업데이트
      await setDoc(
        attendanceDocRef,
        {
          ...data,
          records: updatedRecords,
        },
        { merge: false }
      );

      // 감사 로그 생성
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.exists() ? userDoc.data() : {};
        const editorName = userData.displayName || user.email || user.uid;

        const details = editingStudentData.status !== '출석'
          ? `${editingStudent.studentName} 학생 기록 수정: ${editingStudentData.status}`
          : `${editingStudent.studentName} 학생 기록 수정: 출석으로 변경`;

        await addDoc(collection(db, 'audit_logs'), {
          timestamp: new Date(),
          editorId: user.uid,
          editorName: editorName,
          action: 'ATTENDANCE_UPDATE',
          targetDocId: docId,
          schoolId: schoolId,
          className: selectedClass,
          date: selectedDateForDetail,
          details: details,
        });
      } catch (logError) {
        console.error('감사 로그 생성 오류:', logError);
      }

      // 목록 새로고침
      await loadAttendanceDetail(selectedDateForDetail);
      
      // 모달 닫기
      setShowEditStudentModal(false);
      setEditingStudent(null);
      setEditingStudentData(null);
    } catch (err) {
      console.error('학생 기록 수정 오류:', err);
      alert('학생 기록 수정 중 오류가 발생했습니다.');
    } finally {
      setSavingStudentEdit(false);
    }
  }, [user, selectedDateForDetail, selectedClass, schoolId, editingStudent, editingStudentData, loadAttendanceDetail]);

  // 개별 학생 기록 삭제 (출석으로 변경)
  const handleDeleteStudentRecord = useCallback(async (studentRecord) => {
    if (!user || !selectedDateForDetail || !selectedClass || !schoolId) return;

    if (!window.confirm(`${studentRecord.studentName} 학생의 이상 기록을 삭제하고 출석으로 변경하시겠습니까?`)) {
      return;
    }

    setDeletingStudentRecord(studentRecord.studentId);
    try {
      const docId = `${schoolId}-${selectedClass}-${selectedDateForDetail}`;
      const attendanceDocRef = doc(db, 'attendance', docId);
      const attendanceDoc = await getDoc(attendanceDocRef);

      if (!attendanceDoc.exists()) {
        alert('출석 기록을 찾을 수 없습니다.');
        return;
      }

      const data = attendanceDoc.data();
      const records = data.records || [];

      // 해당 학생의 기록을 출석으로 변경
      const updatedRecords = records.map((record) => {
        if (record.studentId === studentRecord.studentId) {
          return {
            ...record,
            status: '출석',
            reason: '',
            periods: [],
            memo: record.memo || '', // 비고는 유지
          };
        }
        return record;
      });

      // Firestore 업데이트
      await setDoc(
        attendanceDocRef,
        {
          ...data,
          records: updatedRecords,
        },
        { merge: false }
      );

      // 감사 로그 생성
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.exists() ? userDoc.data() : {};
        const editorName = userData.displayName || user.email || user.uid;

        await addDoc(collection(db, 'audit_logs'), {
          timestamp: new Date(),
          editorId: user.uid,
          editorName: editorName,
          action: 'ATTENDANCE_UPDATE',
          targetDocId: docId,
          schoolId: schoolId,
          className: selectedClass,
          date: selectedDateForDetail,
          details: `${studentRecord.studentName} 학생 이상 기록 삭제 (출석으로 변경)`,
        });
      } catch (logError) {
        console.error('감사 로그 생성 오류:', logError);
      }

      // 목록 새로고침
      await loadAttendanceDetail(selectedDateForDetail);
    } catch (err) {
      console.error('학생 기록 삭제 오류:', err);
      alert('학생 기록 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingStudentRecord(null);
    }
  }, [user, selectedDateForDetail, selectedClass, schoolId, loadAttendanceDetail]);

  // 출석 기록이 있는 날짜인지 확인하는 함수 (강화된 검증)
  const hasAttendanceOnDate = useCallback(
    (dateObj) => {
      if (!dateObj) return false;
      
      try {
        const dateStr = formatDateValue(dateObj);
        
        // 날짜 형식 검증 (YYYY-MM-DD)
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          return false;
        }
        
        // Set에서 확인
        const hasAttendance = attendanceDateSet.has(dateStr);
        
        return hasAttendance;
      } catch (err) {
        console.error('날짜 포맷 오류:', err, dateObj);
        return false;
      }
    },
    [attendanceDateSet, formatDateValue]
  );

  const tileClassName = useCallback(
    ({ date, view }) => {
      if (view === 'month' && date) {
        try {
          const hasAttendance = hasAttendanceOnDate(date);
          if (hasAttendance) {
            return 'react-calendar__tile--has-attendance';
          }
        } catch (err) {
          console.error('tileClassName 오류:', err);
        }
      }
      return null;
    },
    [hasAttendanceOnDate]
  );

  if (studentsLoading) {
    return <LoadingSpinner />;
  }

  if (!hasStudents) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900">출석 달력</h2>
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
          등록된 학생이 없습니다. 먼저 학생 관리 페이지에서 학생을 등록하세요.
        </div>
        <button
          onClick={() => navigate('/students')}
          className="px-4 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
        >
          학생 관리로 이동
        </button>
      </div>
    );
  }

  // 초기 로딩 중일 때만 스피너 표시
  if (loading && user) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">출석 달력</h2>
        {selectedClass && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleShowMonthlyView}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <CalendarDays className="w-4 h-4" />
              <span>월별 기록 보기</span>
            </button>
            <button
              onClick={handleShowStudentView}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              <CalendarDays className="w-4 h-4" />
              <span>학생별 기록 보기</span>
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>다운로드 중...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>출석 기록 다운로드</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-gray-500">
            출석 기록 날짜 수: {attendanceDates.length}개
          </div>
          <button
            onClick={handleTodayClick}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>오늘</span>
          </button>
        </div>
        <Calendar
          onChange={handleDateChange}
          onActiveStartDateChange={handleActiveStartDateChange}
          value={date}
          activeStartDate={activeMonth}
          tileClassName={tileClassName}
          className="w-full border-0"
          formatDay={(locale, date) => date.getDate().toString()}
          calendarType="gregory"
          locale="ko-KR"
        />
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span>출석 기록이 있는 날짜</span>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow-sm p-4">
        <p className="text-sm text-gray-600">
          날짜를 선택하면 해당 날짜의 출석부를 입력할 수 있습니다.
        </p>
      </div>

      {/* 월별 기록 모달 */}
      {showMonthlyView && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] flex flex-col">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">
                {format(activeMonth, 'yyyy년 M월')} 출석 기록
              </h3>
              <button
                onClick={() => setShowMonthlyView(false)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 모달 내용 */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingMonthly ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : monthlyRecords.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  이 달에는 출석 기록이 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-gray-700 font-semibold">날짜</th>
                        <th className="px-4 py-3 text-left text-gray-700 font-semibold">요약</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {monthlyRecords.map(({ date, day, month, summary, abnormalCount }) => (
                        <tr
                          key={date}
                          className={`hover:bg-gray-50 transition-colors ${
                            abnormalCount > 0 ? 'bg-white' : 'bg-gray-50/50'
                          }`}
                        >
                          <td className="px-4 py-3 text-gray-900 font-medium whitespace-nowrap">
                            {month}월 {day}일
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {abnormalCount > 0 ? (
                              <span className="text-gray-900">{summary}</span>
                            ) : (
                              <span className="text-gray-500 italic">{summary}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 출석 기록 상세 모달 */}
      {showAttendanceDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">
                {selectedDateForDetail ? 
                  (() => {
                    try {
                      return format(new Date(selectedDateForDetail.replace(/-/g, '/')), 'yyyy년 M월 d일');
                    } catch (err) {
                      return selectedDateForDetail;
                    }
                  })() : 
                  '출석 기록'}
              </h3>
              <button
                onClick={() => {
                  setShowAttendanceDetail(false);
                  setSelectedDateForDetail(null);
                  setAttendanceDetailRecords([]);
                }}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 모달 내용 */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingDetail ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : attendanceDetailRecords.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  출석 기록이 없습니다.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-gray-700 font-semibold">번호</th>
                          <th className="px-4 py-3 text-left text-gray-700 font-semibold">이름</th>
                          <th className="px-4 py-3 text-left text-gray-700 font-semibold">상태</th>
                          <th className="px-4 py-3 text-left text-gray-700 font-semibold">사유</th>
                          <th className="px-4 py-3 text-left text-gray-700 font-semibold">교시</th>
                          <th className="px-4 py-3 text-left text-gray-700 font-semibold">비고</th>
                          <th className="px-4 py-3 text-left text-gray-700 font-semibold">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {attendanceDetailRecords.map((record, index) => (
                          <tr
                            key={record.studentId || index}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-4 py-3 text-gray-900 font-medium">
                              {record.studentNumber || '-'}
                            </td>
                            <td className="px-4 py-3 text-gray-900 font-medium">
                              {record.studentName || '-'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                record.status === '출석' ? 'bg-green-100 text-green-800' :
                                record.status === '지각' ? 'bg-yellow-100 text-yellow-800' :
                                record.status === '조퇴' ? 'bg-orange-100 text-orange-800' :
                                record.status === '결석' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {record.status || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {record.reason || '-'}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {record.periods && Array.isArray(record.periods) && record.periods.length > 0
                                ? record.periods.join(', ') + '교시'
                                : '-'}
                            </td>
                            <td className="px-4 py-3 text-gray-700 text-xs">
                              {record.memo || '-'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleEditStudent(record)}
                                  className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                                  aria-label="수정"
                                  title="수정"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                {record.status !== '출석' && (
                                  <button
                                    onClick={() => handleDeleteStudentRecord(record)}
                                    disabled={deletingStudentRecord === record.studentId}
                                    className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    aria-label="삭제"
                                    title="삭제"
                                  >
                                    {deletingStudentRecord === record.studentId ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-4 h-4" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 개별 학생 수정 모달 */}
      {showEditStudentModal && editingStudent && editingStudentData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">
                {editingStudent.studentName} 학생 수정
              </h3>
              <button
                onClick={() => {
                  setShowEditStudentModal(false);
                  setEditingStudent(null);
                  setEditingStudentData(null);
                }}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 모달 내용 */}
            <div className="p-6 space-y-4">
              {/* 상태 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">상태</label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        setEditingStudentData((prev) => ({
                          ...prev,
                          status,
                          reason: status === '출석' ? '' : prev.reason,
                          periods: ['지각', '조퇴', '결과'].includes(status) ? prev.periods : [],
                        }));
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        editingStudentData.status === status
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* 사유 선택 */}
              {editingStudentData.status !== '출석' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    사유 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {REASON_OPTIONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => {
                          setEditingStudentData((prev) => ({ ...prev, reason }));
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          editingStudentData.reason === reason
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 교시 선택 */}
              {['지각', '조퇴', '결과'].includes(editingStudentData.status) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    교시 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PERIODS.map((period) => (
                      <button
                        key={period}
                        type="button"
                        onClick={() => {
                          const currentPeriods = editingStudentData.periods || [];
                          const newPeriods = currentPeriods.includes(period)
                            ? currentPeriods.filter((p) => p !== period)
                            : [...currentPeriods, period].sort((a, b) => a - b);
                          setEditingStudentData((prev) => ({ ...prev, periods: newPeriods }));
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          editingStudentData.periods?.includes(period)
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {period}교시
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 비고 입력 */}
              <div>
                <label htmlFor="edit-memo" className="block text-sm font-medium text-gray-700 mb-2">
                  비고 (선택사항)
                </label>
                <textarea
                  id="edit-memo"
                  value={editingStudentData.memo || ''}
                  onChange={(e) => {
                    setEditingStudentData((prev) => ({ ...prev, memo: e.target.value }));
                  }}
                  placeholder="추가 메모를 입력하세요 (선택사항)"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none resize-none"
                />
              </div>

              {/* 저장 버튼 */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowEditStudentModal(false);
                    setEditingStudent(null);
                    setEditingStudentData(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSaveStudentEdit}
                  disabled={savingStudentEdit}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingStudentEdit ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>저장 중...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>저장</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 학생별 기록 모달 */}
      {showStudentView && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] flex flex-col">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">
                {format(activeMonth, 'yyyy년 M월')} 학생별 출석 기록
              </h3>
              <button
                onClick={() => setShowStudentView(false)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 모달 내용 */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingStudent ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-gray-700 font-semibold">번호</th>
                        <th className="px-4 py-3 text-left text-gray-700 font-semibold">이름</th>
                        <th className="px-4 py-3 text-left text-gray-700 font-semibold">지각</th>
                        <th className="px-4 py-3 text-left text-gray-700 font-semibold">조퇴</th>
                        <th className="px-4 py-3 text-left text-gray-700 font-semibold">결석</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {studentRecords.map((record) => (
                        <tr
                          key={record.studentId}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-3 text-gray-900 font-medium">{record.number}</td>
                          <td className="px-4 py-3 text-gray-900 font-medium">{record.name}</td>
                          <td className="px-4 py-3 text-gray-700">
                            {record.late.length > 0 ? (
                              <span className="text-yellow-700">
                                {record.late.join(', ')} 총 {record.late.length}회
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {record.earlyLeave.length > 0 ? (
                              <span className="text-orange-700">
                                {record.earlyLeave.join(', ')} 총 {record.earlyLeave.length}회
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {record.absent.length > 0 ? (
                              <span className="text-red-700">
                                {record.absent.join(', ')} 총 {record.absent.length}회
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(Dashboard);

