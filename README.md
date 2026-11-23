# OFFAIR — BSSM Broadcast Guide Book

부산소프트웨어마이스터고 방송부 위키. **Next.js 16 · TypeScript · Tailwind v4 · 파일 기반 MDX**.

공간은 둘이고 **둘 다 부원 전용**이다 (부원·부장·최고 관리자·졸업생(읽기만)). 손님·교사·미등록은 어느 화면을 열어도 로그인 벽만 본다.

| 화면 이름 | 공간 id | 주소 | 문서 위치 |
| --- | --- | --- | --- |
| 가이드북 | `guide` | `/`, `/docs/…` | 이 저장소 `content/docs/` (GitHub 으로 push) |
| 개발 문서 | `members` | `/members`, `/members/…` | 서버 PC 데이터 폴더 `<OFFAIR_DATA_DIR>/members` (어디에도 push 안 함) |

> 이 GitHub 저장소가 공개인 동안에는 `content/` 의 가이드북 MDX 와 `public/uploads/` 가 GitHub 에서 그대로 보인다. 위키 화면은 막혀도 저장소는 따로 비공개로 돌려야 한다.

## 개발

```bash
npm run dev     # 개발 서버
npm run build   # 프로덕션 빌드 (모든 화면이 요청마다 권한을 확인하는 동적 렌더링, 문서는 빌드 결과에 안 들어간다)
npm start       # 빌드 결과 실행
```

## 위키 백엔드

서버 PC 에서 위키로 쓰기 위한 저장소·git 이력·API·권한은 [`docs/wiki-backend.md`](docs/wiki-backend.md) 참고.
`npm test` 로 백엔드 테스트를 돌린다.

Vercel 사본은 이제 쓸모가 없다: 빌드는 되지만(`VERCEL=1`, ONAIR 없음) 모든 화면이 로그인 벽이다.

개발 문서 공간을 씨앗 폴더(`.md`·`.mdx`)로 처음 채우려면 `npm run import:dev-docs -- <폴더>` (바뀐 것만, 지우지 않음, 한 커밋).
서버 PC 에서는 `OFFAIR 시작.cmd` 가 `온에어\ONAIR-SERVER\docs\offair-dev` 를 자동으로 가져온다. 자세한 규칙은 `docs/wiki-backend.md` "개발 문서 씨앗 가져오기".

## 위키 편집 (`/write/<공간>/<문서>`)

문서 위 막대의 **편집**(또는 ⌘K → E, 서랍 트리의 ＋·새 문서)으로 연다. 부원(ONAIR 로그인) 이상만 열리고,
게시하면 git 커밋이 생긴다. 개발 문서는 `/members`. 자세한 구조·권한·Access 설정은 `docs/wiki-backend.md`.

개발할 때 로그인 없이 써 보려면 `OFFAIR_DEV_ROLE=lead npm run dev`. 시험 저장이 이 저장소에 커밋되지 않게
`OFFAIR_GUIDE_REPO=<이 저장소를 clone 한 임시 폴더> OFFAIR_DATA_DIR=<임시 폴더>` 를 함께 준다.

## 수정 모드 (dev 전용, `/edit`)

`npm run dev` 에서만 열리는 인-브라우저 편집 UI. 프로덕션에선 404로 잠깁니다.

- **`/edit`** — 문서를 **제목**으로 보여주는 관리 화면. 드래그로 사이드바(문서·카테고리)
  순서를 바꾸고 **레이아웃 저장**, **새 문서 만들기**, **삭제**, 카테고리 추가/이름변경.
- **`/edit/<경로>`** — 단일 문서 편집기(좌: MDX 원문 / 우: 실시간 프리뷰, `⌘S` 저장).
- 각 문서 위 막대의 **편집** 버튼(dev 에서만 동작, 프로덕션에선 비활성)으로 진입. `/edit` 는 주소로 직접.

사이드바 순서는 `content/sidebar.json`(카테고리 순서) + 각 문서 frontmatter의
`category`/`order` 로 결정되며, 위 UI가 이 둘을 모두 써줍니다.

## 문서 작성 (파일 직접)

`content/docs/` 아래에 `.mdx` 파일을 하나 추가하면 **사이드바·목차·이전/다음 링크가
자동 생성**됩니다. 폴더로 중첩해도 됩니다 (`content/docs/audio/mixer.mdx` → `/docs/audio/mixer`).

```mdx
---
title: 문서 제목
description: 한 줄 설명
category: 송출        # 사이드바 그룹: 시작하기 / 장비 / 송출 / 음향 / 조명·영상 / 운영
order: 1             # 그룹 내 순서
---

본문을 마크다운으로 작성합니다.
```

그룹 표시 순서는 `lib/content.ts` 의 `CATEGORY_ORDER` 에서 조정합니다.

### 바로 쓸 수 있는 MDX 컴포넌트

import 없이 MDX 안에서 사용합니다. 전체 예시는 `content/docs/getting-started.mdx`
와 `content/contribution.mdx` 참고.

| 컴포넌트 | 용도 |
| --- | --- |
| `<Callout type="tip\|info\|note\|warn\|danger" title="..">` | 강조 블록 |
| `<Steps>` + `<Step title="..">` | 번호 매겨진 절차 |
| `<Figure src alt caption width height />` | 캡션·클릭 확대 이미지 |
| `<CardGrid>` + `<Card href title>` | 링크 카드 그리드 |
| `<Kbd>`, `<Badge tone="beam\|muted\|warn">` | 인라인 단축키·배지 |
| 코드 펜스 ` ``` ` | 문법 강조 + 복사 버튼 자동 |

## 구조

```
app/                  라우트 (홈, /docs/[...slug], /recent, /members, /contribution). 모두 요청마다 권한 확인
components/shell/     레이아웃 D: 아이콘 레일 · 문서 트리 서랍 · 위 막대 · 화면 설정(테마/서랍/목차)
components/doc/       문서 화면 (제목 · 메타 · 이전/다음)
components/mdx/       MDX에 주입되는 컴포넌트 맵
lib/content.ts        content/ 스캔 · 사이드바/목차 생성
lib/doc-info.ts       수정일(파일 mtime) · 작성자(frontmatter author) · 읽는 시간
lib/mdx.tsx           @mdx-js/mdx 로 RSC에서 컴파일·렌더
content/docs/*.mdx    실제 문서
app/fonts/            Pretendard (로컬 폰트)
```

테마: `app/globals.css` 의 CSS 토큰(라이트 기본, `[data-theme="dark"]` 와 기기 다크 설정).
레일의 달 아이콘으로 바꾸면 localStorage 에 저장되고, 기기 설정과 같아지면 다시 "기기 따라가기"로 돌아갑니다.
폰트: **Pretendard** — `next/font/local` 로 로드.
