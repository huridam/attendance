import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, deleteDoc, doc, writeBatch, updateDoc } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { db, auth } from '../firebase';
import Papa from 'papaparse';
import { Upload, Save, Trash2, Loader2, AlertTriangle, Edit2 } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import { useStudentContext } from '../context/StudentContext';

export default function StudentManagement() {
  const [user] = useAuthState(auth);
  const { refreshStudentMeta, selectedClass, selectClass, schoolId } = useStudentContext();
  const [className, setClassName] = useState('');
  const [classFilterInput, setClassFilterInput] = useState(selectedClass || '');
  const [classFilter, setClassFilter] = useState(selectedClass || '');
  const [csvData, setCsvData] = useState([]);
  const [parsingCsv, setParsingCsv] = useState(false);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingScores, setEditingScores] = useState({});
  const [updatingScore, setUpdatingScore] = useState(null);
  const [csvScoreData, setCsvScoreData] = useState([]);
  const [parsingScoreCsv, setParsingScoreCsv] = useState(false);
  const [updatingScores, setUpdatingScores] = useState(false);

  useEffect(() => {
    setClassFilterInput(selectedClass || '');
    setClassFilter(selectedClass || '');
  }, [selectedClass]);

  const loadStudents = useCallback(async (targetClass) => {
    if (!user || !schoolId) {
      setLoading(false);
      return;
    }
    const normalizedClass = (targetClass || '').trim();
    if (!normalizedClass) {
      setStudents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const q = query(
        collection(db, 'students'),
        where('schoolId', '==', schoolId),
        where('className', '==', normalizedClass)
      );
      const querySnapshot = await getDocs(q);
      const studentsList = [];
      querySnapshot.forEach((doc) => {
        studentsList.push({ id: doc.id, ...doc.data() });
      });
      setStudents(studentsList.sort((a, b) => (a.number || 0) - (b.number || 0)));
    } catch (err) {
      console.error('학생 목록 로드 오류:', err);
      setError('학생 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [user, schoolId]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadStudents(classFilter);
  }, [user, classFilter, loadStudents]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setParsingCsv(true);
    setError('');
    setCsvData([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      worker: false, // worker를 false로 변경하여 동기적으로 처리
      complete: (results) => {
        setParsingCsv(false);
        
        // 에러가 있으면 표시
        if (results.errors && results.errors.length > 0) {
          const errorMsg = results.errors.map(e => e.message || e.toString()).join(', ');
          setError(`CSV 파싱 오류: ${errorMsg}`);
          console.error('CSV 파싱 에러:', results.errors);
          return;
        }

        // 데이터가 없으면 에러
        if (!results.data || results.data.length === 0) {
          setError('CSV 파일에 데이터가 없습니다. number, name 컬럼이 포함되어 있는지 확인해주세요.');
          return;
        }

        // 데이터 파싱 및 검증
        const parsed = results.data
          .map((row, index) => {
            // number 필드 확인
            const numberRaw = row.number || row.Number || row.NUMBER || row['번호'];
            const numberValue = numberRaw ? Number(numberRaw) : NaN;
            
            // name 필드 확인
            const nameRaw = row.name || row.Name || row.NAME || row['이름'];
            const nameValue = typeof nameRaw === 'string' ? nameRaw.trim() : '';
            
            // point 필드 확인 (성적, 선택사항)
            const pointRaw = row.point || row.Point || row.POINT || row['성적'] || row['점수'];
            const pointValue = pointRaw ? Number(pointRaw) : null;
            const finalPoint = (pointValue !== null && Number.isFinite(pointValue) && pointValue >= 0) ? pointValue : null;
            
            if (!Number.isFinite(numberValue) || numberValue <= 0) {
              console.warn(`행 ${index + 2}: 번호가 유효하지 않음 (${numberRaw})`);
              return null;
            }
            if (!nameValue) {
              console.warn(`행 ${index + 2}: 이름이 없음`);
              return null;
            }
            
            return {
              number: numberValue,
              name: nameValue,
              point: finalPoint,
            };
          })
          .filter(Boolean);

        if (parsed.length === 0) {
          setError('유효한 데이터가 없습니다. CSV 파일에 number(번호)와 name(이름) 컬럼이 포함되어 있고, 값이 올바른지 확인해주세요.');
          return;
        }

        setCsvData(parsed);
        setError('');
        console.log(`CSV 파싱 완료: ${parsed.length}명의 학생 데이터`);
      },
      error: (error) => {
        setParsingCsv(false);
        const errorMsg = error.message || error.toString() || '알 수 없는 오류';
        setError(`CSV 파일을 읽는 중 오류가 발생했습니다: ${errorMsg}`);
        console.error('CSV 파일 읽기 오류:', error);
      },
    });
  };

  const handleSave = async () => {
    if (!user) return;
    if (!className.trim()) {
      setError('학급 이름을 입력해주세요.');
      return;
    }
    if (csvData.length === 0) {
      setError('CSV 파일을 업로드해주세요.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const normalizedClass = className.trim();
      const batch = writeBatch(db);
      const newStudents = [];

      csvData.forEach((student) => {
        const docRef = doc(collection(db, 'students'));
        const studentData = {
          schoolId: schoolId,
          teacherId: user.uid,
          className: normalizedClass,
          number: student.number,
          name: student.name,
        };
        // point 필드가 있으면 추가
        if (student.point !== null && student.point !== undefined) {
          studentData.point = student.point;
        }
        batch.set(docRef, studentData);
        newStudents.push({
          id: docRef.id,
          ...studentData,
        });
      });

      await batch.commit();
      setCsvData([]);
      setClassName('');
      setClassFilterInput(normalizedClass);
      setClassFilter(normalizedClass);
      // 선택된 클래스를 먼저 설정하여 리디렉션 방지
      selectClass(normalizedClass);
      setStudents((prev) =>
        [...prev, ...newStudents].sort((a, b) => (a.number || 0) - (b.number || 0))
      );
      // 메타데이터 새로고침 (비동기로 실행하여 리디렉션 방지)
      setTimeout(() => {
        refreshStudentMeta?.();
      }, 100);
    } catch (err) {
      console.error('저장 오류:', err);
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStudent = async (studentId) => {
    if (!confirm('이 학생을 삭제하시겠습니까?')) return;

    try {
      await deleteDoc(doc(db, 'students', studentId));
      await loadStudents(classFilter);
      refreshStudentMeta?.();
    } catch (err) {
      console.error('삭제 오류:', err);
      setError('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteClass = async () => {
    if (!classFilter || !user) return;

    const confirmMessage = `정말로 "${classFilter}" 학급의 모든 데이터를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없으며, 다음 데이터가 영구적으로 삭제됩니다:\n- 모든 학생 데이터\n- 모든 출석 기록`;
    
    if (!confirm(confirmMessage)) return;

    setLoading(true);
    setError('');

    try {
      // 1. 해당 학급의 모든 학생 삭제
      const studentsQuery = query(
        collection(db, 'students'),
        where('schoolId', '==', schoolId),
        where('className', '==', classFilter)
      );
      const studentsSnapshot = await getDocs(studentsQuery);
      const studentBatch = writeBatch(db);
      studentsSnapshot.forEach((docSnap) => {
        studentBatch.delete(docSnap.ref);
      });
      await studentBatch.commit();

      // 2. 해당 학급의 모든 출석 기록 삭제
      const attendanceQuery = query(
        collection(db, 'attendance'),
        where('schoolId', '==', schoolId),
        where('className', '==', classFilter)
      );
      const attendanceSnapshot = await getDocs(attendanceQuery);
      const attendanceBatch = writeBatch(db);
      attendanceSnapshot.forEach((docSnap) => {
        attendanceBatch.delete(docSnap.ref);
      });
      await attendanceBatch.commit();

      // 3. 상태 초기화
      setClassFilter('');
      setClassFilterInput('');
      setStudents([]);
      selectClass('');
      await refreshStudentMeta?.();
    } catch (err) {
      console.error('학급 삭제 오류:', err);
      setError('학급 삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleScoreChange = (studentId, value) => {
    setEditingScores((prev) => ({
      ...prev,
      [studentId]: value === '' ? null : (Number(value) >= 0 ? Number(value) : prev[studentId]),
    }));
  };

  const handleUpdateScore = async (studentId) => {
    if (!user || !studentId) return;

    const newScore = editingScores[studentId];
    if (newScore === undefined) return;

    setUpdatingScore(studentId);
    setError('');

    try {
      const studentRef = doc(db, 'students', studentId);
      const updateData = {};
      
      if (newScore === null || newScore === '') {
        // 점수 삭제
        updateData.point = null;
      } else {
        updateData.point = Number(newScore);
      }

      await updateDoc(studentRef, updateData);
      
      // 로컬 상태 업데이트
      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId ? { ...s, point: updateData.point } : s
        )
      );
      
      // 편집 상태 초기화
      setEditingScores((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
    } catch (err) {
      console.error('점수 업데이트 오류:', err);
      setError('점수 업데이트 중 오류가 발생했습니다.');
    } finally {
      setUpdatingScore(null);
    }
  };

  const handleScoreCsvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!classFilter) {
      setError('먼저 학급을 선택해주세요.');
      return;
    }

    setParsingScoreCsv(true);
    setError('');
    setCsvScoreData([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      worker: false,
      complete: (results) => {
        setParsingScoreCsv(false);
        
        if (results.errors && results.errors.length > 0) {
          const errorMsg = results.errors.map(e => e.message || e.toString()).join(', ');
          setError(`CSV 파싱 오류: ${errorMsg}`);
          console.error('CSV 파싱 에러:', results.errors);
          return;
        }

        if (!results.data || results.data.length === 0) {
          setError('CSV 파일에 데이터가 없습니다. number, name, point(또는 점수) 컬럼이 포함되어 있는지 확인해주세요.');
          return;
        }

        // 데이터 파싱 및 검증
        const parsed = results.data
          .map((row, index) => {
            const numberRaw = row.number || row.Number || row.NUMBER || row['번호'];
            const numberValue = numberRaw ? Number(numberRaw) : NaN;
            
            const nameRaw = row.name || row.Name || row.NAME || row['이름'];
            const nameValue = typeof nameRaw === 'string' ? nameRaw.trim() : '';
            
            const pointRaw = row.point || row.Point || row.POINT || row['성적'] || row['점수'];
            const pointValue = pointRaw !== undefined && pointRaw !== '' && pointRaw !== null 
              ? Number(pointRaw) 
              : null;
            const finalPoint = (pointValue !== null && Number.isFinite(pointValue) && pointValue >= 0) 
              ? pointValue 
              : null;
            
            if (!Number.isFinite(numberValue) || numberValue <= 0) {
              console.warn(`행 ${index + 2}: 번호가 유효하지 않음 (${numberRaw})`);
              return null;
            }
            if (!nameValue) {
              console.warn(`행 ${index + 2}: 이름이 없음`);
              return null;
            }
            
            return {
              number: numberValue,
              name: nameValue,
              point: finalPoint,
            };
          })
          .filter(Boolean);

        if (parsed.length === 0) {
          setError('유효한 데이터가 없습니다. CSV 파일에 number(번호), name(이름), point(점수) 컬럼이 포함되어 있고, 값이 올바른지 확인해주세요.');
          return;
        }

        setCsvScoreData(parsed);
        setError('');
        console.log(`점수 CSV 파싱 완료: ${parsed.length}명의 학생 데이터`);
      },
      error: (error) => {
        setParsingScoreCsv(false);
        const errorMsg = error.message || error.toString() || '알 수 없는 오류';
        setError(`CSV 파일을 읽는 중 오류가 발생했습니다: ${errorMsg}`);
        console.error('CSV 파일 읽기 오류:', error);
      },
    });
  };

  const handleUpdateScoresFromCsv = async () => {
    if (!user || !classFilter || csvScoreData.length === 0) return;

    setUpdatingScores(true);
    setError('');

    try {
      // 현재 학생 목록과 매칭
      const studentMap = new Map();
      students.forEach((student) => {
        studentMap.set(`${student.number}-${student.name}`, student);
      });

      const batch = writeBatch(db);
      let updateCount = 0;

      csvScoreData.forEach((csvRow) => {
        const key = `${csvRow.number}-${csvRow.name}`;
        const student = studentMap.get(key);

        if (student) {
          const studentRef = doc(db, 'students', student.id);
          const updateData = {};
          
          if (csvRow.point === null || csvRow.point === undefined) {
            updateData.point = null;
          } else {
            updateData.point = csvRow.point;
          }

          batch.update(studentRef, updateData);
          updateCount++;
        }
      });

      if (updateCount === 0) {
        setError('매칭되는 학생이 없습니다. 번호와 이름이 정확한지 확인해주세요.');
        setUpdatingScores(false);
        return;
      }

      await batch.commit();

      // 로컬 상태 업데이트
      await loadStudents(classFilter);
      
      setCsvScoreData([]);
      setError('');
      alert(`${updateCount}명의 학생 점수가 업데이트되었습니다.`);
    } catch (err) {
      console.error('점수 일괄 업데이트 오류:', err);
      setError('점수 일괄 업데이트 중 오류가 발생했습니다.');
    } finally {
      setUpdatingScores(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">학생 관리</h2>

      <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
        <div>
          <label htmlFor="classFilter" className="block text-sm font-medium text-gray-700 mb-2">
            조회할 학급
          </label>
          <div className="flex gap-3">
            <input
              id="classFilter"
              type="text"
              value={classFilterInput}
              onChange={(e) => setClassFilterInput(e.target.value)}
              placeholder="예: 1학년 3반"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const next = classFilterInput.trim();
                setClassFilter(next);
                if (next) {
                  selectClass(next);
                }
              }}
              className="px-4 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              적용
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            학급을 선택해야 학생 명단과 출석 데이터가 로드됩니다.
          </p>
        </div>
        {classFilter && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              현재 선택된 학급: <span className="font-semibold text-gray-900">{classFilter}</span>
            </div>
            <button
              onClick={handleDeleteClass}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>학급 전체 삭제</span>
            </button>
          </div>
        )}
      </div>

      {!classFilter && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
          학급을 선택하면 학생 명단과 출석 입력 대상이 로드됩니다.
        </div>
      )}

      {loading && classFilter && students.length === 0 && user && (
        <LoadingSpinner />
      )}

      <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
        <div>
          <label htmlFor="className" className="block text-sm font-medium text-gray-700 mb-2">
            학급 이름
          </label>
          <input
            id="className"
            type="text"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="예: 1학년 3반"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            CSV 파일 업로드
          </label>
          <div className="flex items-center gap-4">
            <label className="flex-1 cursor-pointer">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors">
                <Upload className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-600">CSV 파일 선택</span>
              </div>
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            CSV 형식: number, name (헤더 포함)
          </p>
          {parsingCsv && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>CSV 파일을 파싱하는 중입니다...</span>
            </div>
          )}
        </div>

        {csvData.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">미리보기 ({csvData.length}명)</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-700 font-medium">번호</th>
                      <th className="px-3 py-2 text-left text-gray-700 font-medium">이름</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.map((row, idx) => (
                      <tr key={idx} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-900">{row.number}</td>
                        <td className="px-3 py-2 text-gray-900">{row.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || parsingCsv}
              className="mt-4 w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>

      {students.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">
              등록된 학생 ({students.length}명)
            </h3>
            <div className="text-xs text-gray-500">
              점수를 수정하려면 입력 후 저장 버튼을 클릭하세요
            </div>
          </div>
          
          {/* 점수 일괄 수정 CSV 업로드 */}
          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CSV 파일로 점수 일괄 수정
            </label>
            <div className="flex items-center gap-4">
              <label className="flex-1 cursor-pointer">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleScoreCsvUpload}
                  className="hidden"
                />
                <div className="flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors">
                  <Upload className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-600">점수 CSV 파일 선택</span>
                </div>
              </label>
              {csvScoreData.length > 0 && (
                <button
                  onClick={handleUpdateScoresFromCsv}
                  disabled={updatingScores}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {updatingScores ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>업데이트 중...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>점수 일괄 저장</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              CSV 형식: number, name, point(또는 점수) (헤더 포함)
            </p>
            {parsingScoreCsv && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>CSV 파일을 파싱하는 중입니다...</span>
              </div>
            )}
            {csvScoreData.length > 0 && (
              <div className="mt-2 text-xs text-green-600">
                {csvScoreData.length}명의 학생 점수 데이터가 준비되었습니다.
              </div>
            )}
          </div>

          {/* 학생 목록 */}
          <div className="border-t border-gray-200 pt-4">
            <div className="space-y-2">
              {students.map((student) => {
                const isEditing = editingScores.hasOwnProperty(student.id);
                const currentScore = isEditing ? editingScores[student.id] : (student.point ?? '');
                const isUpdating = updatingScore === student.id;

                return (
                  <div
                    key={student.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg gap-3"
                  >
                    <div className="flex-1 flex items-center gap-3">
                      <div className="min-w-[60px]">
                        <span className="text-sm text-gray-600">{student?.number || ''}번</span>
                      </div>
                      <div className="flex-1 min-w-[120px]">
                        <span className="text-gray-900 font-medium">{student?.name || ''}</span>
                      </div>
                      <div className="flex items-center gap-2 min-w-[200px]">
                        {isEditing ? (
                          <>
                            <span className="text-xs text-gray-500">점수:</span>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={currentScore === null ? '' : currentScore}
                              onChange={(e) => handleScoreChange(student.id, e.target.value)}
                              placeholder="점수 입력"
                              className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                              disabled={isUpdating}
                            />
                            <button
                              onClick={() => handleUpdateScore(student.id)}
                              disabled={isUpdating}
                              className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                              {isUpdating ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Save className="w-3 h-3" />
                              )}
                              <span>저장</span>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setEditingScores((prev) => ({ ...prev, [student.id]: student.point ?? null }))}
                            className="p-1 text-gray-600 hover:text-gray-700 transition-colors"
                            aria-label="점수 수정"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteStudent(student.id)}
                      className="p-2 text-red-600 hover:text-red-700 transition-colors"
                      aria-label="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

