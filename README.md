# OFFAIR — BSSM Broadcast Guide Book

부산소프트웨어마이스터고 방송부 웹 가이드북. **Next.js 16 · TypeScript · Tailwind v4 · 파일 기반 MDX**.

## 개발

```bash
npm run dev     # 개발 서버
npm run build   # 프로덕션 빌드 (모든 문서 SSG)
npm start       # 빌드 결과 실행
```

## 위키 백엔드

서버 PC 에서 위키로 쓰기 위한 저장소·git 이력·API·권한은 [`docs/wiki-backend.md`](docs/wiki-backend.md) 참고.
`npm test` 로 백엔드 테스트를 돌린다.

## 수정 모드 (dev 전용, `/edit`)

`npm run dev` 에서만 열리는 인-브라우저 편집 UI. 프로덕션에선 404로 잠깁니다.

- **`/edit`** — 문서를 **제목**으로 보여주는 관리 화면. 드래그로 사이드바(문서·카테고리)
  순서를 바꾸고 **레이아웃 저장**, **새 문서 만들기**, **삭제**, 카테고리 추가/이름변경.
- **`/edit/<경로>`** — 단일 문서 편집기(좌: MDX 원문 / 우: 실시간 프리뷰, `⌘S` 저장).
- 각 문서 페이지 우하단의 **수정** 플로팅 버튼, 헤더의 **✎ Edit** 링크로 진입.

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
app/                  라우트 (홈=히어로, /docs/[...slug], /contribution)
components/            레이아웃 + MDX 컴포넌트
  mdx/                MDX에 주입되는 컴포넌트 맵
lib/content.ts        content/ 스캔 · 사이드바/목차 생성
lib/mdx.tsx           @mdx-js/mdx 로 RSC에서 컴파일·렌더
content/docs/*.mdx    실제 문서
public/background.png 히어로 배경
app/fonts/            Orbitron · Pretendard (로컬 폰트)
```

폰트: **Orbitron**(로고·핵심 텍스트), **Pretendard**(본문) — `next/font/local` 로 로드.
