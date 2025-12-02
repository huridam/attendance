import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, setDoc, addDoc, getDoc } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { db, auth } from '../firebase';
import { Building2, Search, Loader2, Lock, School, List } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';

// 비밀번호 해시 함수 (Web Crypto API 사용)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// 비밀번호 검증 함수
async function verifyPassword(password, hashedPassword) {
  const hashed = await hashPassword(password);
  return hashed === hashedPassword;
}

export default function SchoolSetup() {
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('select'); // 'select', 'create', 'join'
  const [schoolName, setSchoolName] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [userSchoolId, setUserSchoolId] = useState(null);
  const [mySchools, setMySchools] = useState([]);
  const [loadingMySchools, setLoadingMySchools] = useState(false);
  const [switchingSchool, setSwitchingSchool] = useState(false);

  // 사용자 프로필 확인
  useEffect(() => {
    const checkUserProfile = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // users 컬렉션에서 사용자 프로필 확인
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.schoolId) {
            // 이미 학교에 가입되어 있으면 ClassSelector로 이동
            setUserSchoolId(userData.schoolId);
            navigate('/select-class');
            return;
          }
        } else {
          // 사용자 프로필이 없으면 생성
          await setDoc(userDocRef, {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || '',
            schoolId: null,
            createdAt: new Date(),
          });
        }
      } catch (err) {
        console.error('사용자 프로필 확인 오류:', err);
        setError('사용자 정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    checkUserProfile();
  }, [user, navigate]);

  // 내 학교 목록 로드
  useEffect(() => {
    const loadMySchools = async () => {
      if (!user) {
        setMySchools([]);
        return;
      }

      setLoadingMySchools(true);
      try {
        const schoolsSet = new Map(); // 중복 제거를 위해 Map 사용

        // 1. 사용자가 개설한 학교 조회 (creatorId == user.uid)
        const createdSchoolsQuery = query(
          collection(db, 'schools'),
          where('creatorId', '==', user.uid)
        );
        const createdSnapshot = await getDocs(createdSchoolsQuery);
        createdSnapshot.forEach((doc) => {
          const data = doc.data();
          schoolsSet.set(doc.id, {
            id: doc.id,
            name: data.name || '',
            createdAt: data.createdAt,
            isCreator: true,
          });
        });

        // 2. 현재 사용자가 가입한 학교 조회 (users 컬렉션에서 현재 사용자의 schoolId 확인)
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const currentSchoolId = userData.schoolId;
          
          // 현재 가입한 학교가 있고, 아직 목록에 없으면 추가
          if (currentSchoolId && !schoolsSet.has(currentSchoolId)) {
            try {
              const schoolDocRef = doc(db, 'schools', currentSchoolId);
              const schoolDoc = await getDoc(schoolDocRef);
              if (schoolDoc.exists()) {
                const schoolData = schoolDoc.data();
                schoolsSet.set(currentSchoolId, {
                  id: currentSchoolId,
                  name: schoolData.name || '',
                  createdAt: schoolData.createdAt,
                  isCreator: schoolData.creatorId === user.uid,
                });
              }
            } catch (err) {
              console.error(`학교 ${currentSchoolId} 조회 오류:`, err);
            }
          }
        }

        // 배열로 변환 및 정렬 (생성일 기준 내림차순)
        const schoolsList = Array.from(schoolsSet.values()).sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0);
          const dateB = b.createdAt?.toDate?.() || new Date(0);
          return dateB - dateA;
        });

        setMySchools(schoolsList);
      } catch (err) {
        console.error('내 학교 목록 로드 오류:', err);
        setMySchools([]);
      } finally {
        setLoadingMySchools(false);
      }
    };

    loadMySchools();
  }, [user]);

  // 학교 재선택
  const handleSelectSchool = async (schoolId) => {
    if (!user) return;

    setSwitchingSchool(true);
    setError('');

    try {
      // 사용자 프로필에 schoolId 업데이트
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        schoolId: schoolId,
      }, { merge: true });

      // ClassSelector로 이동
      navigate('/select-class');
    } catch (err) {
      console.error('학교 재선택 오류:', err);
      setError('학교 재선택 중 오류가 발생했습니다.');
      setSwitchingSchool(false);
    }
  };

  // 학교 검색
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError('학교 이름을 입력해주세요.');
      return;
    }

    setSearching(true);
    setError('');
    setSearchResults([]);

    try {
      const schoolsQuery = query(
        collection(db, 'schools'),
        where('name', '>=', searchQuery.trim()),
        where('name', '<=', searchQuery.trim() + '\uf8ff')
      );
      const snapshot = await getDocs(schoolsQuery);
      const results = [];
      snapshot.forEach((doc) => {
        results.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      setSearchResults(results);
      if (results.length === 0) {
        setError('검색 결과가 없습니다.');
      }
    } catch (err) {
      console.error('학교 검색 오류:', err);
      setError('학교 검색 중 오류가 발생했습니다.');
    } finally {
      setSearching(false);
    }
  };

  // 학교 개설
  const handleCreateSchool = async () => {
    if (!schoolName.trim()) {
      setError('학교 이름을 입력해주세요.');
      return;
    }
    if (!joinPassword.trim()) {
      setError('가입 비밀번호를 입력해주세요.');
      return;
    }
    if (joinPassword.length < 4) {
      setError('비밀번호는 최소 4자 이상이어야 합니다.');
      return;
    }

    setCreating(true);
    setError('');

    try {
      // 비밀번호 해시 처리
      const hashedPassword = await hashPassword(joinPassword);

      // 학교 생성
      const schoolDocRef = await addDoc(collection(db, 'schools'), {
        name: schoolName.trim(),
        creatorId: user.uid,
        joinPassword: hashedPassword,
        createdAt: new Date(),
      });

      // 사용자 프로필에 schoolId 저장
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        schoolId: schoolDocRef.id,
      }, { merge: true });

      // ClassSelector로 이동
      navigate('/select-class');
    } catch (err) {
      console.error('학교 개설 오류:', err);
      setError('학교 개설 중 오류가 발생했습니다.');
    } finally {
      setCreating(false);
    }
  };

  // 학교 가입
  const handleJoinSchool = async (schoolId, schoolName) => {
    if (!joinPassword.trim()) {
      setError('가입 비밀번호를 입력해주세요.');
      return;
    }

    setJoining(true);
    setError('');

    try {
      // 학교 정보 가져오기
      const schoolDocRef = doc(db, 'schools', schoolId);
      const schoolDoc = await getDoc(schoolDocRef);

      if (!schoolDoc.exists()) {
        setError('학교 정보를 찾을 수 없습니다.');
        setJoining(false);
        return;
      }

      const schoolData = schoolDoc.data();
      const storedHashedPassword = schoolData.joinPassword;

      // 비밀번호 검증
      const isValid = await verifyPassword(joinPassword, storedHashedPassword);

      if (!isValid) {
        setError('비밀번호가 일치하지 않습니다.');
        setJoining(false);
        return;
      }

      // 사용자 프로필에 schoolId 저장
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        schoolId: schoolId,
      }, { merge: true });

      // ClassSelector로 이동
      navigate('/select-class');
    } catch (err) {
      console.error('학교 가입 오류:', err);
      setError('학교 가입 중 오류가 발생했습니다.');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (userSchoolId) {
    // 이미 학교에 가입되어 있으면 로딩 중 표시 (navigate가 실행 중)
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 lg:px-8 py-8 pt-24 lg:pt-32">
      <div className="w-full max-w-md lg:max-w-2xl">
        <div className="bg-white rounded-xl shadow-md p-6 lg:p-8 space-y-6">
          <div className="text-center">
            <School className="w-12 h-12 mx-auto mb-3 text-gray-900" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">학교 설정</h1>
            <p className="text-sm text-gray-600">
              학교를 개설하거나 기존 학교에 가입하세요.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {mode === 'select' && (
            <div className="space-y-4">
              {/* 내 학교 목록 */}
              {mySchools.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <List className="w-4 h-4" />
                    <span>내 학교 목록</span>
                  </div>
                  {loadingMySchools ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {mySchools.map((school) => (
                        <button
                          key={school.id}
                          onClick={() => handleSelectSchool(school.id)}
                          disabled={switchingSchool}
                          className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div className="flex-1 text-left">
                            <p className="font-medium text-gray-900">{school.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {school.isCreator ? '개설한 학교' : '가입한 학교'}
                            </p>
                          </div>
                          {switchingSchool ? (
                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                          ) : (
                            <span className="text-xs text-gray-600">선택 →</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {mySchools.length > 0 && (
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-xs text-gray-500 text-center mb-3">
                    또는 새로운 학교를 개설하거나 가입하세요
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={() => setMode('create')}
                  className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors"
                >
                  <Building2 className="w-5 h-5" />
                  <span>학교 개설</span>
                </button>
                <button
                  onClick={() => setMode('join')}
                  className="w-full flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-700 py-3 rounded-lg font-medium hover:border-gray-400 transition-colors"
                >
                  <Search className="w-5 h-5" />
                  <span>학교 검색 및 가입</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'create' && (
            <div className="space-y-4">
              <button
                onClick={() => {
                  setMode('select');
                  setSchoolName('');
                  setJoinPassword('');
                  setError('');
                }}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                ← 뒤로가기
              </button>
              <div>
                <label htmlFor="schoolName" className="block text-sm font-medium text-gray-700 mb-2">
                  학교 이름
                </label>
                <input
                  id="schoolName"
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="예: 서울초등학교"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label htmlFor="createPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  가입 비밀번호
                </label>
                <div className="relative">
                  <input
                    id="createPassword"
                    type="password"
                    value={joinPassword}
                    onChange={(e) => setJoinPassword(e.target.value)}
                    placeholder="다른 선생님들이 사용할 비밀번호"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none pr-10"
                  />
                  <Lock className="w-5 h-5 absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  다른 선생님들이 이 학교에 가입할 때 사용할 비밀번호를 설정하세요.
                </p>
              </div>
              <button
                onClick={handleCreateSchool}
                disabled={creating}
                className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>학교 개설 중...</span>
                  </>
                ) : (
                  <>
                    <Building2 className="w-5 h-5" />
                    <span>학교 개설</span>
                  </>
                )}
              </button>
            </div>
          )}

          {mode === 'join' && (
            <div className="space-y-4">
              <button
                onClick={() => {
                  setMode('select');
                  setSearchQuery('');
                  setSearchResults([]);
                  setJoinPassword('');
                  setError('');
                }}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                ← 뒤로가기
              </button>
              <div>
                <label htmlFor="searchQuery" className="block text-sm font-medium text-gray-700 mb-2">
                  학교 이름 검색
                </label>
                <div className="flex gap-2">
                  <input
                    id="searchQuery"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="예: 서울초등학교"
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={searching}
                    className="px-4 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {searching ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Search className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="joinPassword" className="block text-sm font-medium text-gray-700 mb-2">
                      가입 비밀번호
                    </label>
                    <div className="relative">
                      <input
                        id="joinPassword"
                        type="password"
                        value={joinPassword}
                        onChange={(e) => setJoinPassword(e.target.value)}
                        placeholder="학교 가입 비밀번호 입력"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none pr-10"
                      />
                      <Lock className="w-5 h-5 absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">검색 결과:</p>
                    {searchResults.map((school) => (
                      <div
                        key={school.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{school.name}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            생성일: {school.createdAt?.toDate?.().toLocaleDateString('ko-KR') || '알 수 없음'}
                          </p>
                        </div>
                        <button
                          onClick={() => handleJoinSchool(school.id, school.name)}
                          disabled={joining || !joinPassword.trim()}
                          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {joining ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            '가입'
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

