import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { Calendar, Users, UsersRound } from 'lucide-react';
import { useStudentContext } from '../context/StudentContext';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedClass } = useStudentContext();

  const isActive = (path) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {selectedClass && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-md lg:max-w-7xl mx-auto px-4 lg:px-8 py-2">
            <button
              type="button"
              onClick={() => navigate('/select-class')}
              className="text-xs text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
            >
              현재 학급: {selectedClass}
            </button>
          </div>
        </div>
      )}

      <main className="max-w-md lg:max-w-7xl mx-auto px-4 lg:px-8 py-6">
        <Outlet />
      </main>

      {/* 모바일 네비게이션 (lg 미만에서만 표시) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 lg:hidden z-10">
        <div className="max-w-md mx-auto flex">
          <Link
            to="/dashboard"
            className={`flex-1 flex flex-col items-center justify-center py-3 transition-colors ${
              isActive('/dashboard') ? 'text-gray-900' : 'text-gray-500'
            }`}
          >
            <Calendar className="w-6 h-6 mb-1" />
            <span className="text-xs">달력</span>
          </Link>
          <Link
            to="/students"
            className={`flex-1 flex flex-col items-center justify-center py-3 transition-colors ${
              isActive('/students') ? 'text-gray-900' : 'text-gray-500'
            }`}
          >
            <Users className="w-6 h-6 mb-1" />
            <span className="text-xs">학생 관리</span>
          </Link>
          <Link
            to="/group-creator"
            className={`flex-1 flex flex-col items-center justify-center py-3 transition-colors ${
              isActive('/group-creator') ? 'text-gray-900' : 'text-gray-500'
            }`}
          >
            <UsersRound className="w-6 h-6 mb-1" />
            <span className="text-xs">조 편성</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}

