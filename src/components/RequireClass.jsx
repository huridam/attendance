import { Navigate, useLocation } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';
import { useStudentContext } from '../context/StudentContext';

export default function RequireClass({ children }) {
  const { studentsLoading, hasStudents, selectedClass } = useStudentContext();
  const location = useLocation();

  // 로딩 중이면 스피너 표시
  if (studentsLoading) {
    return <LoadingSpinner />;
  }

  // 학생이 없으면 학생 관리 페이지로 이동
  if (!hasStudents) {
    return <Navigate to="/students" replace />;
  }

  // selectedClass 확인 (localStorage도 체크하여 상태 유실 방지)
  const savedClass = typeof window !== 'undefined' ? localStorage.getItem('selectedClass') : null;
  const effectiveClass = selectedClass || savedClass;

  // selectedClass가 없고, 현재 경로가 /select-class가 아니면 학급 선택 페이지로 이동
  // 단, 로딩이 완료된 후에만 리디렉션
  // 또한 출석 입력 페이지(/attendance/)에서는 리디렉션하지 않음 (저장 중일 수 있음)
  if (!effectiveClass && 
      location.pathname !== '/select-class' && 
      !location.pathname.startsWith('/attendance/')) {
    return <Navigate to="/select-class" replace state={{ from: location.pathname }} />;
  }

  return children;
}

