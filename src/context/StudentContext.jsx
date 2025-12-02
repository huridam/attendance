import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const StudentContext = createContext({
  studentsLoading: true,
  hasStudents: false,
  classOptions: [],
  selectedClass: '',
  schoolId: null,
  selectClass: () => {},
  refreshStudentMeta: async () => {},
});

const getInitialClass = () =>
  typeof window !== 'undefined' ? localStorage.getItem('selectedClass') || '' : '';

export function StudentProvider({ user, children }) {
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [hasStudents, setHasStudents] = useState(false);
  const [classOptions, setClassOptions] = useState([]);
  const [schoolId, setSchoolId] = useState(null);
  // 초기값을 localStorage에서 가져오되, 없으면 빈 문자열
  const [selectedClass, setSelectedClassState] = useState(() => {
    const saved = getInitialClass();
    return saved || '';
  });

  const persistSelectedClass = useCallback((value) => {
    setSelectedClassState(value);
    if (typeof window !== 'undefined') {
      if (value) {
        localStorage.setItem('selectedClass', value);
      } else {
        localStorage.removeItem('selectedClass');
      }
    }
  }, []);

  const selectClass = useCallback(
    (value) => {
      persistSelectedClass(value);
    },
    [persistSelectedClass]
  );

  // schoolId 가져오기
  const loadSchoolId = useCallback(async () => {
    if (!user) {
      setSchoolId(null);
      return null;
    }

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const currentSchoolId = userData.schoolId || null;
        setSchoolId(currentSchoolId);
        return currentSchoolId;
      } else {
        setSchoolId(null);
        return null;
      }
    } catch (error) {
      console.error('schoolId 로드 오류:', error);
      setSchoolId(null);
      return null;
    }
  }, [user]);

  const refreshStudentMeta = useCallback(async () => {
    if (!user) {
      setHasStudents(false);
      setClassOptions([]);
      persistSelectedClass('');
      setStudentsLoading(false);
      return;
    }

    // schoolId 먼저 확인
    const currentSchoolId = await loadSchoolId();
    if (!currentSchoolId) {
      setHasStudents(false);
      setClassOptions([]);
      persistSelectedClass('');
      setStudentsLoading(false);
      return;
    }

    setStudentsLoading(true);
    try {
      // schoolId 기반으로 쿼리 변경
      const studentsQuery = query(
        collection(db, 'students'),
        where('schoolId', '==', currentSchoolId)
      );
      const snapshot = await getDocs(studentsQuery);
      const classesSet = new Set();
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data?.className) {
          classesSet.add(data.className);
        }
      });
      const classes = Array.from(classesSet).sort((a, b) => a.localeCompare(b));
      setClassOptions(classes);
      setHasStudents(classes.length > 0);

      // selectedClass가 이미 있고 유효하면 유지 (리디렉션 방지)
      // localStorage도 확인하여 상태 유실 방지
      const savedClass = typeof window !== 'undefined' ? localStorage.getItem('selectedClass') : null;
      const currentClass = selectedClass || savedClass;
      
      let nextSelected = currentClass;
      if (classes.length === 0) {
        // 학생이 없으면 선택 해제
        nextSelected = '';
      } else if (currentClass && classes.includes(currentClass)) {
        // 현재 선택된 클래스가 유효하면 유지
        nextSelected = currentClass;
      } else if (!currentClass && classes.length > 0) {
        // 선택된 클래스가 없고 학생이 있으면 첫 번째 클래스 선택하지 않음
        // 사용자가 명시적으로 선택하도록 함
        nextSelected = '';
      }
      
      // 선택된 클래스가 변경된 경우에만 업데이트
      // 단, 현재 selectedClass와 다르고, localStorage에도 없을 때만 업데이트
      if (nextSelected !== selectedClass) {
        if (nextSelected) {
          persistSelectedClass(nextSelected);
        } else if (!savedClass) {
          // localStorage에도 없을 때만 초기화
          persistSelectedClass('');
        }
      } else if (nextSelected && typeof window !== 'undefined') {
        // localStorage 동기화 (상태 유지) - 항상 최신 상태로 유지
        localStorage.setItem('selectedClass', nextSelected);
      }
    } catch (error) {
      console.error('학생 데이터 확인 오류:', error);
    } finally {
      setStudentsLoading(false);
    }
  }, [user, selectedClass, persistSelectedClass, loadSchoolId]);

  useEffect(() => {
    refreshStudentMeta();
  }, [refreshStudentMeta]);

  return (
    <StudentContext.Provider
      value={{
        studentsLoading,
        hasStudents,
        classOptions,
        selectedClass,
        schoolId,
        selectClass,
        refreshStudentMeta,
      }}
    >
      {children}
    </StudentContext.Provider>
  );
}

export const useStudentContext = () => useContext(StudentContext);

