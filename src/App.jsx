import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import StudentManagement from './pages/StudentManagement';
import AttendanceInput from './pages/AttendanceInput';
import ClassSelector from './pages/ClassSelector';
import GroupCreator from './pages/GroupCreator';
import SchoolSetup from './pages/SchoolSetup';
import Layout from './components/Layout';
import RequireClass from './components/RequireClass';
import GlobalHeader from './components/GlobalHeader';
import { StudentProvider } from './context/StudentContext';
import LoadingSpinner from './components/LoadingSpinner';

function App() {
  const [user, loading] = useAuthState(auth);
  const [checkingSchool, setCheckingSchool] = useState(false);
  const [initialPath, setInitialPath] = useState(null);

  // 인증 상태 확인 및 초기 라우팅 결정
  useEffect(() => {
    const checkInitialRoute = async () => {
      if (loading) return;
      
      if (!user) {
        setInitialPath('/login');
        return;
      }

      setCheckingSchool(true);
      try {
        // 사용자 프로필에서 schoolId 확인
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.schoolId) {
            // 학교 설정 완료 - ClassSelector로
            setInitialPath('/select-class');
          } else {
            // 학교 설정 미완료 - SchoolSetup으로
            setInitialPath('/school-setup');
          }
        } else {
          // 사용자 프로필 없음 - SchoolSetup으로
          setInitialPath('/school-setup');
        }
      } catch (error) {
        console.error('초기 라우팅 확인 오류:', error);
        setInitialPath('/school-setup');
      } finally {
        setCheckingSchool(false);
      }
    };

    checkInitialRoute();
  }, [user, loading]);

  if (loading || checkingSchool || initialPath === null) {
    return <LoadingSpinner />;
  }

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to={initialPath} replace /> : <Login />}
        />
        <Route
          path="/*"
          element={
            user ? (
              <StudentProvider user={user}>
                <AuthenticatedRoutes initialPath={initialPath} />
              </StudentProvider>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </Router>
  );
}

function AuthenticatedRoutes({ initialPath }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <GlobalHeader />
      <Routes>
        <Route path="/school-setup" element={<SchoolSetup />} />
        <Route path="/select-class" element={<ClassSelector />} />
        <Route path="/" element={<Navigate to={initialPath || '/school-setup'} replace />} />
        <Route element={<Layout />}>
          <Route
            path="/dashboard"
            element={
              <RequireClass>
                <Dashboard />
              </RequireClass>
            }
          />
          <Route path="/students" element={<StudentManagement />} />
          <Route
            path="/group-creator"
            element={
              <RequireClass>
                <GroupCreator />
              </RequireClass>
            }
          />
          <Route
            path="/attendance/:date"
            element={
              <RequireClass>
                <AttendanceInput />
              </RequireClass>
            }
          />
          <Route path="*" element={<Navigate to="/select-class" replace />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;

