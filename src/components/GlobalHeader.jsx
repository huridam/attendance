import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { LogOut, RefreshCw, Calendar, Users, UsersRound } from 'lucide-react';
import { useStudentContext } from '../context/StudentContext';

export default function GlobalHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { schoolId } = useStudentContext();
  const [user] = useAuthState(auth);
  const [schoolName, setSchoolName] = useState('');
  const [loadingSchool, setLoadingSchool] = useState(false);

  const isActive = (path) => location.pathname === path;
  const isSchoolSetupPage = location.pathname === '/school-setup';
  const shouldShowSchoolInfo = schoolId && !isSchoolSetupPage;

  // 학교 이름 로드
  useEffect(() => {
    const loadSchoolName = async () => {
      if (!schoolId) {
        setSchoolName('');
        return;
      }

      setLoadingSchool(true);
      try {
        const schoolDocRef = doc(db, 'schools', schoolId);
        const schoolDoc = await getDoc(schoolDocRef);
        
        if (schoolDoc.exists()) {
          const schoolData = schoolDoc.data();
          setSchoolName(schoolData.name || '');
        } else {
          setSchoolName('');
        }
      } catch (error) {
        console.error('학교 이름 로드 오류:', error);
        setSchoolName('');
      } finally {
        setLoadingSchool(false);
      }
    };

    loadSchoolName();
  }, [schoolId]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }
  };

  const handleChangeSchool = async () => {
    const confirmed = window.confirm(
      '현재 학교와의 연결을 끊고 새로운 학교를 설정하시겠습니까?'
    );

    if (!confirmed) return;

    if (!user) return;

    try {
      // 사용자 프로필에서 schoolId 초기화
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, { schoolId: null }, { merge: true });

      // SchoolSetup으로 이동
      navigate('/school-setup', { replace: true });
    } catch (error) {
      console.error('학교 변경 오류:', error);
      alert('학교 변경 중 오류가 발생했습니다.');
    }
  };

  return (
    <header className="bg-white shadow-sm sticky top-0 z-10">
      <div className="max-w-md lg:max-w-7xl mx-auto px-4 lg:px-8">
        {/* 상단: 제목, 학교 정보(모바일), 사용자 정보 */}
        <div className="flex items-center justify-between gap-3 py-3">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <h1 className="text-lg font-semibold text-gray-900">출석부</h1>
            {/* 모바일에서 학교 정보 표시 */}
            {shouldShowSchoolInfo && (
              <div className="lg:hidden flex items-center gap-1.5">
                <span className="text-gray-400">|</span>
                {loadingSchool ? (
                  <span className="text-xs text-gray-500">로딩 중...</span>
                ) : (
                  <>
                    <span className="text-xs text-gray-600 truncate max-w-[100px]">
                      {schoolName}
                    </span>
                    <button
                      onClick={handleChangeSchool}
                      className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                      aria-label="학교 변경"
                      title="학교 변경"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {user && user.email && (
              <>
                <span className="text-xs text-gray-600 truncate max-w-[120px]">
                  {user.email}님
                </span>
                <span className="text-gray-400">|</span>
              </>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1.5"
              aria-label="로그아웃"
            >
              <LogOut className="w-4 h-4" />
              <span>로그아웃</span>
            </button>
          </div>
        </div>

        {/* 데스크톱 네비게이션 (lg 이상에서만 표시) */}
        <nav className="hidden lg:flex border-t border-gray-200">
          <div className="flex items-center gap-4 w-full">
            {/* 학교 정보 (좌측) */}
            {shouldShowSchoolInfo && (
              <div className="flex items-center gap-2 pr-4 border-r border-gray-200">
                {loadingSchool ? (
                  <span className="text-sm text-gray-500">로딩 중...</span>
                ) : (
                  <>
                    <span className="text-sm font-medium text-gray-900 truncate max-w-[150px]">
                      {schoolName}
                    </span>
                    <button
                      onClick={handleChangeSchool}
                      className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex items-center gap-1"
                      aria-label="학교 변경"
                      title="학교 변경"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>학교 변경</span>
                    </button>
                  </>
                )}
              </div>
            )}
            {/* 네비게이션 탭 */}
            <div className="flex items-center gap-1 flex-1">
            <Link
              to="/dashboard"
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                isActive('/dashboard')
                  ? 'text-gray-900 border-gray-900'
                  : 'text-gray-600 border-transparent hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>달력</span>
            </Link>
            <Link
              to="/students"
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                isActive('/students')
                  ? 'text-gray-900 border-gray-900'
                  : 'text-gray-600 border-transparent hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>학생 관리</span>
            </Link>
            <Link
              to="/group-creator"
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                isActive('/group-creator')
                  ? 'text-gray-900 border-gray-900'
                  : 'text-gray-600 border-transparent hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <UsersRound className="w-4 h-4" />
              <span>조 편성</span>
            </Link>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}

