import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, setDoc, addDoc, getDoc } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { db, auth } from '../firebase';
import { Save, ArrowLeft, Loader2 } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import { useStudentContext } from '../context/StudentContext';

const STATUS_OPTIONS = ['출석', '결석', '지각', '조퇴', '결과'];
const REASON_OPTIONS = ['질병', '인정', '미인정'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7];

function AttendanceInput() {
  const { date } = useParams();
  const navigate = useNavigate();
  const [user] = useAuthState(auth);
  const { selectedClass, schoolId } = useStudentContext();
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!user || !date) {
      setLoading(false);
      return;
    }
    if (!selectedClass || !schoolId) {
      setStudents([]);
      setAttendanceRecords({});
      setLoading(false);
      setError('학생 관리 페이지에서 조회할 학급을 먼저 선택해주세요.');
      return;
    }
    setLoading(true);

    try {
      // 학생 목록 로드
      const studentsQuery = query(
        collection(db, 'students'),
        where('schoolId', '==', schoolId),
        where('className', '==', selectedClass)
      );
      const studentsSnapshot = await getDocs(studentsQuery);
      const studentsList = [];
      studentsSnapshot.forEach((doc) => {
        studentsList.push({ id: doc.id, ...doc.data() });
      });
      studentsList.sort((a, b) => (a.number || 0) - (b.number || 0));
      setStudents(studentsList);

      // 기존 출석 기록 로드
      let existingRecords = {};
      const attendanceQuery = query(
        collection(db, 'attendance'),
        where('schoolId', '==', schoolId),
        where('className', '==', selectedClass),
        where('date', '==', date)
      );
      const attendanceSnapshot = await getDocs(attendanceQuery);
      attendanceSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.records && Array.isArray(data.records)) {
          data.records.forEach((record) => {
            existingRecords[record.studentId] = record;
          });
        }
      });

      // 초기 상태 설정
      const initialRecords = {};
      studentsList.forEach((student) => {
        if (existingRecords[student.id]) {
          // 기존 기록이 있으면 memo 필드도 포함 (없으면 빈 문자열)
          initialRecords[student.id] = {
            ...existingRecords[student.id],
            memo: existingRecords[student.id].memo || '',
          };
        } else {
          initialRecords[student.id] = {
            studentId: student.id,
            studentNumber: student.number,
            studentName: student.name,
            status: '출석',
            reason: '',
            periods: [],
            memo: '',
          };
        }
      });
      setAttendanceRecords(initialRecords);
      
      // 첫 번째 학생을 기본 선택
      if (studentsList.length > 0 && !selectedStudentId) {
        setSelectedStudentId(studentsList[0].id);
      }
    } catch (err) {
      console.error('데이터 로드 오류:', err);
      setError('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [user, date, selectedClass, schoolId]);

  useEffect(() => {
    loadData();
  }, [loadData, selectedClass]);
  
  // 학생 목록이 변경되면 첫 번째 학생 선택
  useEffect(() => {
    if (students.length > 0 && !selectedStudentId) {
      setSelectedStudentId(students[0].id);
    }
  }, [students, selectedStudentId]);

  const updateRecord = (studentId, field, value) => {
    setAttendanceRecords((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value,
        // 상태가 변경되면 관련 필드 초기화
        ...(field === 'status' && {
          reason: value === '출석' ? '' : prev[studentId]?.reason || '',
          periods: ['지각', '조퇴', '결과'].includes(value) ? prev[studentId]?.periods || [] : [],
        }),
      },
    }));
  };

  const togglePeriod = (studentId, period) => {
    const currentPeriods = attendanceRecords[studentId]?.periods || [];
    const newPeriods = currentPeriods.includes(period)
      ? currentPeriods.filter((p) => p !== period)
      : [...currentPeriods, period].sort((a, b) => a - b);
    updateRecord(studentId, 'periods', newPeriods);
  };

  const handleSave = async () => {
    if (!user || !date || !selectedClass || !schoolId) return;
    
    // 저장 전에 selectedClass를 로컬 변수에 저장하여 상태 유지 보장
    const currentClass = selectedClass;
    
    if (!selectedStudentId) {
      setError('학생을 선택해주세요.');
      return;
    }

    // 선택된 학생의 기록만 유효성 검사
    const record = attendanceRecords[selectedStudentId];
    if (!record) {
      setError('출석 정보를 입력해주세요.');
      return;
    }
    
    if (record.status !== '출석') {
      if (!record.reason) {
        setError(`${record.studentName} 학생의 사유를 선택해주세요.`);
        return;
      }
      if (['지각', '조퇴', '결과'].includes(record.status) && record.periods.length === 0) {
        setError(`${record.studentName} 학생의 교시를 선택해주세요.`);
        return;
      }
    }
    
    // 모든 학생의 기록을 저장 (기존 방식 유지)
    const records = Object.values(attendanceRecords);

    setSaving(true);
    setError('');

    try {
      // 기존 문서 확인
      const docId = `${schoolId}-${currentClass}-${date}`;
      const attendanceDocRef = doc(db, 'attendance', docId);
      const existingDoc = await getDoc(attendanceDocRef);
      const isUpdate = existingDoc.exists();
      
      // records에 memo 필드 포함 (없으면 빈 문자열)
      const recordsWithMemo = records.map((record) => ({
        ...record,
        memo: record.memo || '',
      }));
      
      await setDoc(
        attendanceDocRef,
        {
          schoolId: schoolId,
          teacherId: user.uid,
          className: currentClass,
          date: date,
          records: recordsWithMemo,
        },
        { merge: false }
      );
      
      // 감사 로그 생성
      try {
        // 사용자 정보 가져오기
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.exists() ? userDoc.data() : {};
        const editorName = userData.displayName || user.email || user.uid;
        
        // 변경 사항 요약 생성 (이상 기록만 필터링)
        const changedRecords = recordsWithMemo.filter(r => {
          if (!isUpdate) {
            // 새로 생성된 경우: 이상 기록만 포함
            return r.status !== '출석';
          }
          const existingData = existingDoc.data();
          const existingRecord = existingData.records?.find(er => er.studentId === r.studentId);
          if (!existingRecord) {
            // 새로 추가된 기록: 이상 기록만 포함
            return r.status !== '출석';
          }
          // 기존 기록과 비교하여 변경된 경우
          const isChanged = existingRecord.status !== r.status || 
                           existingRecord.reason !== r.reason ||
                           JSON.stringify(existingRecord.periods || []) !== JSON.stringify(r.periods || []) ||
                           existingRecord.memo !== r.memo;
          
          if (!isChanged) return false;
          
          // 변경되었지만, 둘 다 '출석'이면 제외
          if (existingRecord.status === '출석' && r.status === '출석') {
            return false;
          }
          
          // 현재 상태가 '출석'이 아니거나, 기존 상태가 '출석'에서 변경된 경우만 포함
          return r.status !== '출석' || existingRecord.status !== '출석';
        });
        
        // 이상 기록만 필터링 (출석 상태 제외)
        const abnormalRecords = changedRecords.filter(r => r.status !== '출석');
        
        let details = '';
        if (abnormalRecords.length > 0) {
          details = `${abnormalRecords.length}명의 학생 이상 기록 ${isUpdate ? '수정' : '생성'}: ${abnormalRecords.map(r => `${r.studentName}(${r.status})`).join(', ')}`;
        } else if (changedRecords.length > 0) {
          // 변경은 있었지만 이상 기록은 없는 경우 (예: 출석 상태만 변경)
          details = '출석 기록 저장';
        } else {
          // 변경 사항이 없는 경우
          details = '출석 기록 저장';
        }
        
        await addDoc(collection(db, 'audit_logs'), {
          timestamp: new Date(),
          editorId: user.uid,
          editorName: editorName,
          action: isUpdate ? 'ATTENDANCE_UPDATE' : 'ATTENDANCE_CREATE',
          targetDocId: docId,
          schoolId: schoolId,
          className: currentClass,
          date: date,
          details: details,
        });
      } catch (logError) {
        console.error('감사 로그 생성 오류:', logError);
        // 로그 오류는 무시하고 계속 진행
      }
      
      // 저장 후 Dashboard로 이동 (리디렉션 방지)
      navigate('/dashboard');
    } catch (err) {
      console.error('저장 오류:', err);
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${year}년 ${parseInt(month)}월 ${parseInt(day)}일`;
  };

  if (!selectedClass) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/select-class')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>학급 선택 페이지로 이동</span>
        </button>
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
          출석을 입력하기 전에 학급을 선택해주세요.
        </div>
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  if (students.length === 0) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>돌아가기</span>
        </button>
        <div className="bg-white rounded-lg shadow-sm p-6 text-center">
          <p className="text-gray-600">등록된 학생이 없습니다.</p>
          <button
            onClick={() => navigate('/students')}
            className="mt-4 text-gray-900 font-medium hover:underline"
          >
            학생 관리 페이지로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">{formatDate(date)}</h2>
          <p className="text-sm text-gray-600">출석부 입력</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* 학생 선택 드롭다운 */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <label htmlFor="studentSelect" className="block text-sm font-medium text-gray-700 mb-2">
          학생 선택
        </label>
        <select
          id="studentSelect"
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none bg-white"
        >
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.number}번 - {student.name}
            </option>
          ))}
        </select>
      </div>

      {/* 선택된 학생의 출석 입력 UI */}
      {selectedStudentId && (() => {
        const student = students.find(s => s.id === selectedStudentId);
        if (!student) return null;
        
        const record = attendanceRecords[selectedStudentId] || {
          status: '출석',
          reason: '',
          periods: [],
          memo: '',
        };
        const showReason = record.status !== '출석';
        const showPeriods = ['지각', '조퇴', '결과'].includes(record.status);

        return (
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <span className="text-sm text-gray-600">{student.number}번</span>
                <span className="ml-2 text-lg font-semibold text-gray-900">{student.name}</span>
              </div>
            </div>

              {/* 상태 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">상태</label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => updateRecord(student.id, 'status', status)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        record.status === status
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
              {showReason && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    사유 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {REASON_OPTIONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => updateRecord(student.id, 'reason', reason)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          record.reason === reason
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
              {showPeriods && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    교시 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PERIODS.map((period) => (
                      <button
                        key={period}
                        type="button"
                        onClick={() => togglePeriod(student.id, period)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          record.periods?.includes(period)
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
                <label htmlFor={`memo-${student.id}`} className="block text-sm font-medium text-gray-700 mb-2">
                  비고 (선택사항)
                </label>
                <textarea
                  id={`memo-${student.id}`}
                  value={record.memo || ''}
                  onChange={(e) => updateRecord(student.id, 'memo', e.target.value)}
                  placeholder="추가 메모를 입력하세요 (선택사항)"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none resize-none"
                />
              </div>
            </div>
          );
        })()}

      <div className="sticky bottom-20 bg-white border-t border-gray-200 p-4 -mx-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>저장 중...</span>
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              <span>저장하기</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default AttendanceInput;

