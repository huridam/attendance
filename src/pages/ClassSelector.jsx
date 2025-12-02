import { useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudentContext } from '../context/StudentContext';
import LoadingSpinner from '../components/LoadingSpinner';

export default function ClassSelector() {
  const { studentsLoading, classOptions, selectedClass, selectClass, hasStudents, schoolId } =
    useStudentContext();
  const navigate = useNavigate();

  // schoolId가 없으면 SchoolSetup으로 리다이렉트
  useEffect(() => {
    if (!studentsLoading && !schoolId) {
      navigate('/school-setup', { replace: true });
    }
  }, [schoolId, studentsLoading, navigate]);

  const sortedClasses = useMemo(
    () => classOptions.slice().sort((a, b) => a.localeCompare(b)),
    [classOptions]
  );

  if (studentsLoading) {
    return <LoadingSpinner />;
  }

  const handleSelect = (className) => {
    selectClass(className);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 lg:px-8 pt-24 lg:pt-32">
      <div className="w-full max-w-md lg:max-w-2xl">
        <div className="bg-white rounded-xl shadow-md p-6 lg:p-8 space-y-4">
          <h1 className="text-2xl font-bold text-gray-900 text-center">학급 선택</h1>
          <p className="text-sm text-gray-600 text-center">
            출석을 관리할 학급을 선택해주세요.
          </p>

          {!hasStudents && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm text-center">
              등록된 학급이 없습니다. 먼저 학생 관리 페이지에서 학생을 추가해주세요.
            </div>
          )}

          {sortedClasses.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {sortedClasses.map((className) => (
                <button
                  key={className}
                  onClick={() => handleSelect(className)}
                  className={`border-2 rounded-lg py-4 px-4 text-center transition-all ${
                    selectedClass === className
                      ? 'border-gray-900 bg-gray-900 text-white shadow-md scale-105'
                      : 'border-gray-200 bg-white hover:border-gray-400 hover:shadow-sm'
                  }`}
                >
                  <div className="font-bold text-lg">{className}</div>
                  {selectedClass === className && (
                    <div className="text-xs mt-1 opacity-80">✓ 선택됨</div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => navigate('/students')}
              className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              학생 관리로 이동
            </button>
          )}

          {hasStudents && (
            <button
              onClick={() => navigate('/students')}
              className="w-full border border-gray-200 text-gray-700 py-3 rounded-lg font-medium hover:border-gray-400 transition-colors"
            >
              학생 관리로 이동
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

