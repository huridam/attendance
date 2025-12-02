import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { db, auth } from '../firebase';
import { useStudentContext } from '../context/StudentContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { UsersRound, CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';

export default function GroupCreator() {
  const [user] = useAuthState(auth);
  const { selectedClass, schoolId } = useStudentContext();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [numGroups, setNumGroups] = useState(4);
  const [excludePairs, setExcludePairs] = useState('');
  const [groups, setGroups] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [violations, setViolations] = useState([]);
  const [violationColorMap, setViolationColorMap] = useState(new Map()); // 학생 ID -> 색상 매핑

  // 학생 데이터 로드
  const loadStudents = useCallback(async () => {
    if (!user || !selectedClass || !schoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const studentsQuery = query(
        collection(db, 'students'),
        where('schoolId', '==', schoolId),
        where('className', '==', selectedClass)
      );
      const querySnapshot = await getDocs(studentsQuery);
      const studentsList = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        studentsList.push({
          id: doc.id,
          number: data.number || 0,
          name: data.name || '',
          point: data.point !== null && data.point !== undefined ? Number(data.point) : null,
          isLeader: data.isLeader || false,
        });
      });
      studentsList.sort((a, b) => (a.number || 0) - (b.number || 0));
      setStudents(studentsList);
    } catch (err) {
      console.error('학생 목록 로드 오류:', err);
      setError('학생 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [user, selectedClass, schoolId]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  // 리더 체크박스 토글
  const toggleLeader = useCallback(async (studentId) => {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;

    const newIsLeader = !student.isLeader;
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, isLeader: newIsLeader } : s))
    );

    // Firestore에 저장
    try {
      await updateDoc(doc(db, 'students', studentId), {
        isLeader: newIsLeader,
      });
    } catch (err) {
      console.error('리더 상태 저장 오류:', err);
      // 롤백
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, isLeader: !newIsLeader } : s))
      );
    }
  }, [students]);

  // 제외 그룹 파싱 (N명 이상 처리)
  const parsedExcludeGroups = useMemo(() => {
    if (!excludePairs.trim()) return [];
    const groups = [];
    const lines = excludePairs.trim().split('\n');
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      // "A학생, B학생, C학생" 또는 "A학생 B학생 C학생" 형식 지원
      const parts = trimmed.split(/[,，\s]+/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        // 이름으로 찾아서 ID 배열로 변환
        const studentIds = [];
        parts.forEach((name) => {
          const student = students.find((s) => s.name === name);
          if (student) {
            studentIds.push(student.id);
          }
        });
        // 중복 제거
        const uniqueIds = [...new Set(studentIds)];
        if (uniqueIds.length >= 2) {
          groups.push(uniqueIds);
        }
      }
    });
    return groups;
  }, [excludePairs, students]);

  // 조 편성 알고리즘
  const createGroups = useCallback(() => {
    if (students.length === 0) {
      setError('학생이 없습니다.');
      return;
    }
    if (numGroups < 1 || numGroups > students.length) {
      setError(`조 개수는 1 이상 ${students.length} 이하여야 합니다.`);
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      // 리더와 일반 학생 분리
      const leaders = students.filter((s) => s.isLeader);
      const nonLeaders = students.filter((s) => !s.isLeader);

      // 각 조 초기화
      const newGroups = Array.from({ length: numGroups }, () => ({
        students: [],
        totalPoint: 0,
        leaderCount: 0,
      }));

      // 1단계: 리더 균등 분배
      leaders.forEach((leader, index) => {
        const groupIndex = index % numGroups;
        newGroups[groupIndex].students.push(leader);
        newGroups[groupIndex].totalPoint += leader.point || 0;
        newGroups[groupIndex].leaderCount += 1;
      });

      // 2단계: 일반 학생을 성적 균등 분배
      // 성적 기준으로 정렬 (높은 순)
      const sortedNonLeaders = [...nonLeaders].sort((a, b) => {
        const pointA = a.point || 0;
        const pointB = b.point || 0;
        return pointB - pointA;
      });

      sortedNonLeaders.forEach((student) => {
        // 각 조의 총점과 학생 수를 고려하여 가장 적합한 조 찾기
        let bestGroupIndex = 0;
        let bestScore = Infinity;

        for (let i = 0; i < numGroups; i++) {
          // 제외 그룹 체크 (N명 이상 처리)
          const hasExcludedGroup = parsedExcludeGroups.some((excludeGroup) => {
            // 현재 학생이 이 제외 그룹에 포함되어 있고
            if (!excludeGroup.includes(student.id)) return false;
            // 조에 이미 같은 제외 그룹의 다른 학생이 있는지 확인
            return newGroups[i].students.some((s) => excludeGroup.includes(s.id));
          });

          if (hasExcludedGroup) continue;

          // 총점과 학생 수를 고려한 점수 계산 (낮을수록 좋음)
          const avgPoint = newGroups[i].totalPoint / (newGroups[i].students.length || 1);
          const studentCount = newGroups[i].students.length;
          const score = Math.abs(avgPoint - (student.point || 0)) + studentCount * 10;

          if (score < bestScore) {
            bestScore = score;
            bestGroupIndex = i;
          }
        }

        // 제외 그룹이 있는 경우, 다른 조를 찾아야 함
        let finalGroupIndex = bestGroupIndex;
        const hasExcludedGroupInBest = parsedExcludeGroups.some((excludeGroup) => {
          if (!excludeGroup.includes(student.id)) return false;
          return newGroups[bestGroupIndex].students.some((s) => excludeGroup.includes(s.id));
        });

        if (hasExcludedGroupInBest) {
          // 다른 조 찾기
          for (let i = 0; i < numGroups; i++) {
            if (i === bestGroupIndex) continue;
            const hasExcludedGroup = parsedExcludeGroups.some((excludeGroup) => {
              if (!excludeGroup.includes(student.id)) return false;
              return newGroups[i].students.some((s) => excludeGroup.includes(s.id));
            });
            if (!hasExcludedGroup) {
              finalGroupIndex = i;
              break;
            }
          }
        }

        newGroups[finalGroupIndex].students.push(student);
        newGroups[finalGroupIndex].totalPoint += student.point || 0;
      });

      // 학생 번호순으로 정렬
      newGroups.forEach((group) => {
        group.students.sort((a, b) => (a.number || 0) - (b.number || 0));
      });

      // 3단계: 위반된 제외 그룹 체크 (N명 이상 처리)
      const violationList = [];
      const colorMap = new Map();
      // 색상 배열 정의 (A쌍=빨간색, B쌍=노란색, C쌍=초록색, D쌍=파란색, E쌍=보라색 등)
      const violationColors = [
        'bg-red-100 border-red-300 text-red-900', // A쌍 - 빨간색
        'bg-yellow-100 border-yellow-300 text-yellow-900', // B쌍 - 노란색
        'bg-green-100 border-green-300 text-green-900', // C쌍 - 초록색
        'bg-blue-100 border-blue-300 text-blue-900', // D쌍 - 파란색
        'bg-purple-100 border-purple-300 text-purple-900', // E쌍 - 보라색
        'bg-pink-100 border-pink-300 text-pink-900', // F쌍 - 분홍색
        'bg-indigo-100 border-indigo-300 text-indigo-900', // G쌍 - 남색
        'bg-orange-100 border-orange-300 text-orange-900', // H쌍 - 주황색
      ];
      const violationColorNames = ['빨간색', '노란색', '초록색', '파란색', '보라색', '분홍색', '남색', '주황색'];

      parsedExcludeGroups.forEach((excludeGroup, groupIndex) => {
        // 이 제외 그룹의 학생들이 같은 조에 있는지 확인
        for (let i = 0; i < newGroups.length; i++) {
          const group = newGroups[i];
          const studentsInGroup = excludeGroup.filter((excludeId) =>
            group.students.some((s) => s.id === excludeId)
          );
          // 제외 그룹의 학생이 2명 이상 같은 조에 있으면 위반
          if (studentsInGroup.length >= 2) {
            const studentNames = studentsInGroup
              .map((id) => students.find((s) => s.id === id)?.name)
              .filter(Boolean);
            if (studentNames.length >= 2) {
              // 위반 정보에 조 번호 및 색상 정보 추가
              const colorIndex = groupIndex % violationColors.length;
              const colorName = violationColorNames[colorIndex];
              violationList.push({
                names: studentNames,
                groupNumber: i + 1,
                studentIds: studentsInGroup,
                colorName: colorName,
                colorIndex: colorIndex,
              });
              
              // 각 학생에 색상 할당
              const colorClass = violationColors[colorIndex];
              studentsInGroup.forEach((studentId) => {
                colorMap.set(studentId, colorClass);
              });
            }
            break; // 한 번만 추가
          }
        }
      });

      setGroups(newGroups);
      setViolations(violationList);
      setViolationColorMap(colorMap);
    } catch (err) {
      console.error('조 편성 오류:', err);
      setError('조 편성 중 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  }, [students, numGroups, parsedExcludeGroups]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!selectedClass) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900">조 편성</h2>
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
          학급을 선택해주세요.
        </div>
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900">조 편성</h2>
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
          등록된 학생이 없습니다. 먼저 학생 관리 페이지에서 학생을 등록하세요.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">조 편성</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* 조 개수 설정 */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <label htmlFor="numGroups" className="block text-sm font-medium text-gray-700 mb-2">
          조 개수
        </label>
        <input
          id="numGroups"
          type="number"
          min="1"
          max={students.length}
          value={numGroups}
          onChange={(e) => setNumGroups(Math.max(1, Math.min(students.length, Number(e.target.value) || 1)))}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
        />
        <p className="mt-2 text-xs text-gray-500">
          최대 {students.length}개까지 설정 가능합니다.
        </p>
      </div>

      {/* 학생 목록 및 리더 선택 (Grid 레이아웃) */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          학생 목록 ({students.length}명)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 max-h-96 overflow-y-auto">
          {students.map((student) => (
            <div
              key={student.id}
              className="flex flex-col p-2 sm:p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors min-w-0"
            >
              <div className="flex flex-col items-center text-center mb-2 flex-1">
                <div className="w-full">
                  <div className="text-xs text-gray-500 mb-1">{student.number}번</div>
                  <div className="text-xs sm:text-sm font-medium text-gray-900 truncate" title={student.name}>
                    {student.name}
                  </div>
                </div>
              </div>
              <label className="flex items-center justify-center gap-1.5 cursor-pointer mt-auto pt-1 border-t border-gray-200">
                <input
                  type="checkbox"
                  checked={student.isLeader || false}
                  onChange={() => toggleLeader(student.id)}
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900 flex-shrink-0"
                />
                <span className="text-xs text-gray-600">리더</span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* 제외 페어 입력 */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <label htmlFor="excludePairs" className="block text-sm font-medium text-gray-700 mb-2">
          제외 페어 (같은 조가 되지 않을 학생 쌍)
        </label>
        <textarea
          id="excludePairs"
          value={excludePairs}
          onChange={(e) => setExcludePairs(e.target.value)}
          placeholder="예: 홍길동, 김철수&#10;이영희, 박민수"
          rows={4}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none resize-none"
        />
        <p className="mt-2 text-xs text-gray-500">
          한 줄에 여러 명을 입력하면 해당 학생들이 모두 서로 다른 조에 배치됩니다.
          <br />
          예: "김민수, 박지훈, 최현우" 또는 "학생1, 학생2"
        </p>
      </div>

      {/* 조 편성 버튼 */}
      <button
        onClick={createGroups}
        disabled={isCreating}
        className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isCreating ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>조 편성 중...</span>
          </>
        ) : (
          <>
            <UsersRound className="w-5 h-5" />
            <span>조 편성 시작</span>
          </>
        )}
      </button>

      {/* 위반 메시지 */}
      {violations.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold mb-1">금지 규칙 위반 안내</p>
              <p className="text-sm mb-2">
                다음 학생들은 금지 규칙에도 불구하고 같은 조에 편성되었습니다:
              </p>
              <ul className="text-sm list-disc list-inside space-y-1">
                {violations.map((violation, idx) => {
                  const pairLabel = String.fromCharCode(65 + violation.colorIndex); // A, B, C, ...
                  return (
                    <li key={idx}>
                      <span className="font-semibold">{pairLabel}쌍 ({violation.colorName})</span>: [{violation.names.join(', ')}] - <span className="font-semibold">{violation.groupNumber}조</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 조 편성 결과 */}
      {groups.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">조 편성 결과</h3>
          <div className="grid grid-cols-1 gap-4">
            {groups.map((group, index) => (
              <div key={index} className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
                  <h4 className="text-base font-semibold text-gray-900">
                    {index + 1}조 ({group.students.length}명)
                  </h4>
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    {group.leaderCount > 0 && (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        리더 {group.leaderCount}명
                      </span>
                    )}
                    {group.totalPoint > 0 && (
                      <span>총점: {group.totalPoint.toFixed(1)}</span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {group.students.map((student) => {
                    const violationColor = violationColorMap.get(student.id);
                    const bgClass = violationColor || 'bg-gray-50';
                    return (
                      <div
                        key={student.id}
                        className={`flex items-center justify-between p-2 rounded border ${
                          violationColor ? `${bgClass} border-2` : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-sm w-10 ${violationColor ? 'font-semibold' : 'text-gray-600'}`}>
                            {student.number}번
                          </span>
                          <span className={`font-medium ${violationColor ? 'font-semibold' : 'text-gray-900'}`}>
                            {student.name}
                          </span>
                          {student.isLeader && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                              리더
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

