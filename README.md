# 출석부 앱

학교 선생님을 위한 모바일 웹 출석부 애플리케이션입니다.

## 기술 스택

- **Frontend:** React (Vite), JavaScript
- **Backend/DB:** Firebase Authentication, Firestore
- **Design:** Tailwind CSS
- **Libraries:** 
  - react-router-dom
  - react-calendar
  - papaparse (CSV 파싱)
  - lucide-react (아이콘)
  - react-firebase-hooks

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. Firebase 설정

`.env.example` 파일을 참고하여 `.env` 파일을 생성하고 Firebase 설정 정보를 입력하세요:

```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain_here
VITE_FIREBASE_PROJECT_ID=your_project_id_here
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket_here
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id_here
VITE_FIREBASE_APP_ID=your_app_id_here
```

### 3. 개발 서버 실행

```bash
npm run dev
```

### 4. 빌드

```bash
npm run build
```

## 주요 기능

### 1. 인증
- 이메일/비밀번호 로그인 및 회원가입
- 보안 라우팅 (로그인하지 않은 사용자는 로그인 페이지로 리다이렉트)

### 2. 학생 관리
- CSV 파일 업로드를 통한 학생 명부 일괄 등록
- CSV 형식: `number`, `name` (헤더 포함)
- 학급 이름 설정
- 등록된 학생 목록 조회 및 삭제

### 3. 출석 달력
- 월별 달력 표시
- 출석 기록이 있는 날짜에 초록색 점 표시
- 날짜 클릭 시 해당 날짜의 출석부 입력 페이지로 이동

### 4. 출석 입력
- 학생별 출석 상태 선택 (출석, 결석, 지각, 조퇴, 결과)
- 사유 선택 (질병, 인정, 미인정) - 출석이 아닐 때 필수
- 교시 선택 (1~7교시) - 지각, 조퇴, 결과일 때 필수
- 일일 출석 기록 저장

## 데이터베이스 구조

### `students` 컬렉션
- `teacherId`: 선생님 UID
- `className`: 학급명
- `number`: 번호
- `name`: 이름

### `attendance` 컬렉션
- 문서 ID: `YYYY-MM-DD` (날짜)
- `teacherId`: 선생님 UID
- `date`: 날짜
- `records`: 출석 기록 배열
  - `studentId`: 학생 문서 ID
  - `studentNumber`: 학생 번호
  - `studentName`: 학생 이름
  - `status`: 상태 (출석, 결석, 지각, 조퇴, 결과)
  - `reason`: 사유 (질병, 인정, 미인정)
  - `periods`: 교시 배열 (1~7)

## 프로젝트 구조

```
src/
├── components/          # 재사용 가능한 컴포넌트
│   ├── Layout.jsx      # 레이아웃 (헤더, 네비게이션)
│   └── LoadingSpinner.jsx
├── pages/              # 페이지 컴포넌트
│   ├── Login.jsx       # 로그인/회원가입
│   ├── Dashboard.jsx   # 메인 달력
│   ├── StudentManagement.jsx  # 학생 관리
│   └── AttendanceInput.jsx    # 출석 입력
├── firebase.js         # Firebase 설정
├── App.jsx            # 라우팅 설정
├── main.jsx           # 앱 진입점
└── index.css          # 전역 스타일
```

## 라이선스

MIT

