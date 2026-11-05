# OFFAIR 위키 백엔드

OFFAIR 를 학교 서버 PC 에서 도는 위키로 쓰기 위한 서버 쪽 구조다. 화면(UI)은 따로 만든다.
문서는 지금처럼 디스크의 MDX 파일이고, 저장할 때마다 git 커밋이 하나씩 생긴다.

## 공간 두 개

| 공간 | 읽기 | 위치 | git |
| --- | --- | --- | --- |
| `guide` (공개) | 누구나 | 이 저장소의 `content/docs/*.mdx`, `content/sidebar.json`, 업로드는 `public/uploads/` | 이 저장소에 커밋, GitHub 으로 자동 push |
| `members` (부원 전용) | 부원·부장·최고 관리자·졸업생(읽기만) | `<데이터 폴더>/members/` | 데이터 폴더 안의 **별도 저장소**. 어디에도 push 하지 않는다 |

GitHub 에서 빌드하는 Vercel 사본에는 `guide` 만 들어간다. Vercel 에서는 `VERCEL=1` 이라 자동으로 읽기 전용이 되고, 데이터 폴더가 없으니 부원 공간도 비어 있다.

## 데이터 폴더 (`OFFAIR_DATA_DIR`, 기본 `./.offair-data`)

```
.offair-data/              ← .gitignore 에 들어 있음. 공개 저장소에 절대 안 올라간다
  members/                 ← 부원 공간 git 저장소 (처음 쓸 때 자동 git init)
    .git/
    docs/**/*.mdx
    sidebar.json
    uploads/<yyyy-mm>/…    ← 부원 업로드 (이 저장소에 커밋)
  comments/<space>/<slug>.json   ← 문서 댓글 (git 아님)
  uploads/<space>.jsonl          ← 누가·언제·원래 이름으로 올렸는지 기록
  logs/push.log                  ← 자동 push 실패·성공 기록
```

데이터 폴더를 `public/`·`content/`·`app/` 같은 공개 저장소의 빌드·서빙 경로 안에 두면 부원 공간을 막는다(503). 부원 저장소는 자기 폴더가 저장소 최상위일 때만 쓰므로, 데이터 폴더가 공개 저장소 안에 있어도 부원 문서가 공개 저장소에 커밋되지 않는다.

## 환경 변수

| 이름 | 기본값 | 뜻 |
| --- | --- | --- |
| `OFFAIR_DATA_DIR` | `./.offair-data` | 위 데이터 폴더 |
| `OFFAIR_GUIDE_REPO` | `.` (실행 폴더) | 공개 공간 저장소 위치. 보통 그대로 둔다 |
| `ONAIR_API_BASE` | `http://127.0.0.1:8000` | 신원을 물어볼 ONAIR 서버 |
| `OFFAIR_ONAIR_TIMEOUT_MS` | `3000` | ONAIR 응답 대기 |
| `OFFAIR_AUTH_CACHE_MS` | `60000` | 토큰별 신원 캐시 (손님 결과는 최대 10초) |
| `OFFAIR_DEV_ROLE` / `OFFAIR_DEV_NAME` / `OFFAIR_DEV_MEMBER_ID` | 없음 | 개발용 우회. `NODE_ENV !== 'production'` 일 때만. 예: `OFFAIR_DEV_ROLE=lead` |
| `OFFAIR_READONLY` | Vercel 이면 켬 | 모든 쓰기를 503 으로 |
| `OFFAIR_GIT_COMMIT` | `1` | 저장마다 커밋. `0` 이면 파일만 쓴다 (이력·되돌리기 안 됨) |
| `OFFAIR_GIT_PUSH` | `0` | 공개 공간 자동 push. **서버 PC 에서만 `1`** |
| `OFFAIR_GIT_REMOTE` | `origin` | push 할 원격 |
| `OFFAIR_GIT_BRANCH` | 지금 브랜치 | push 할 브랜치 |
| `OFFAIR_GIT_PUSH_DEBOUNCE_MS` | `30000` | 마지막 저장 뒤 이만큼 기다렸다 한 번에 push |
| `OFFAIR_GIT_PUSH_MAX_BACKOFF_MS` | `900000` | 실패 뒤 재시도 간격 최대 (30초부터 두 배씩) |
| `OFFAIR_GIT_EMAIL_DOMAIN` | `members.offair.local` | 커밋 작성자 이메일 `<memberId>@<도메인>` |
| `OFFAIR_GIT_COMMITTER_NAME` / `_EMAIL` | `OFFAIR Wiki` / `wiki@offair.local` | 커미터 (서버 PC 에 git user 설정이 없어도 커밋되게) |
| `OFFAIR_GIT_BIN` | `git` | git 실행 파일 |
| `OFFAIR_UPLOAD_MAX_IMAGE_MB` / `_FILE_MB` | `10` / `25` | 업로드 크기 제한 |
| `OFFAIR_SERVICE_TOKEN` | 없음 | 같은 PC 서비스(CUE)의 읽기 전용 대리 접근 토큰. 없으면 그 기능은 꺼진다 (아래 "CUE 연동") |
| `OFFAIR_PUBLIC_URL` | 없음 | 바깥 주소 (예: `https://offair.bssmcast.com`). 검색 결과·문서 글의 `url` 을 절대 주소로. 없으면 `/docs/…` 상대 경로 |
| `OFFAIR_DEV_COHORT` | 없음 | 개발용 우회 사람의 기수 (내 메뉴에 "4기" 처럼 보인다) |
| `OFFAIR_ALLOWED_ORIGINS` | 없음 | 쓰기 요청의 Origin 허용 목록(콤마). 터널이 `Host` 를 `localhost` 로 바꿔 넘겨 쓰기가 403 이 될 때 공개 호스트 이름을 넣는다 |

## 권한

신원은 Cloudflare Access 토큰으로 정한다. 요청의 `Cf-Access-Jwt-Assertion` 머리글(없으면 Access 쿠키 `CF_Authorization`)을 같은 PC 의 ONAIR `GET /api/members/me` 로 그대로 넘기고, ONAIR 가 서명과 AUD 를 확인해 `role`·`name`·`memberId` 를 돌려준다. 토큰이 없으면 ONAIR 를 부르지 않는다. 토큰 없이 127.0.0.1 에서 부르면 ONAIR 가 서버 자신으로 볼 수 있어서다. 승인 대기 중이거나 해제된 부원(`status` 가 `approved` 아님)은 손님으로 본다. ONAIR 가 꺼져 있으면 모두 손님이 되고, 공개 문서는 계속 보인다.

| 동작 | 손님·교사·미등록 | 졸업생 | 부원 | 부장·최고 관리자 |
| --- | --- | --- | --- | --- |
| guide 읽기 (문서·트리·검색·이력·diff) | O | O | O | O |
| members 읽기 | X | O | O | O |
| 모든 쓰기 (저장·만들기·삭제·이동·사이드바·업로드·되돌리기) | X | X | O | O |
| 댓글 보기 | X | O | O | O |
| 댓글 쓰기·내 댓글 고치기/지우기 | X | X | O | O |
| 남의 댓글 지우기, 지금 push | X | X | X | O |

로그인하지 않았으면 `401 {"error":"unauthorized"}`, 로그인했지만 권한이 없으면 `403 {"error":"forbidden"}`. 부원 공간은 권한이 없으면 문서가 있든 없든 똑같이 401/403 이 나간다.
쓰기 요청(POST/PUT/PATCH/DELETE)은 `Origin` 이 같은 호스트일 때만 받는다. Access 쿠키를 다른 사이트가 이용하지 못하게 하려는 것이다.

## API

`<space>` 는 `guide` 또는 `members`. `<slug>` 는 `content/docs` 기준 경로에서 `.mdx` 를 뺀 것이다(`audio/mixer`). 한글은 URL 인코딩해서 보낸다. JSON 응답은 모두 `Cache-Control: no-store`. 오류는 `{ error, message, ... }`.

| 메서드 | 경로 | 권한 | 설명 |
| --- | --- | --- | --- |
| GET | `/api/me` | 누구나 | `{ role, name, memberId, authenticated, canEdit, canReadMembers, canComment, canModerate, readOnly }` |
| GET | `/api/wiki/<space>/tree` | 읽기 | `{ categories, groups: [{ category, order, items: DocMeta[] }] }`. 빈 카테고리도 포함 |
| GET | `/api/wiki/<space>/search[?q=]` | 읽기 | q 없으면 색인 전체(제목·설명·카테고리·소제목·본문 평문), q 있으면 점수순 결과와 스니펫 |
| POST | `/api/wiki/<space>/docs` | 쓰기 | 만들기 `{ title, category?, slug?, description?, body?, frontmatter?, message? }` → 201 |
| GET | `/api/wiki/<space>/docs/<slug>` | 읽기 | `{ …DocMeta, rev, raw, body, frontmatter, toc, lastCommit, commentCount? }` |
| PUT | `/api/wiki/<space>/docs/<slug>` | 쓰기 | 저장 `{ baseRev, raw? \| frontmatter?+body?, message? }`. 그 사이 바뀌었으면 409 |
| DELETE | `/api/wiki/<space>/docs/<slug>[?baseRev=]` | 쓰기 | `git rm` 과 같다. 휴지통·이력에서 되살릴 수 있다 |
| POST | `/api/wiki/<space>/move` | 쓰기 | `{ from, to?, category?, index?, baseRev? }` 이름 바꾸기·폴더·카테고리 이동·순서. 댓글도 따라간다 |
| GET | `/api/wiki/<space>/sidebar` | 읽기 | 카테고리 순서와 그룹별 slug 목록 |
| PUT | `/api/wiki/<space>/sidebar` | 쓰기 | 전체 배치 `{ groups: [{ category, items: [slug…] }] }`. 바뀐 파일만 한 커밋으로 |
| PATCH | `/api/wiki/<space>/sidebar` | 쓰기 | `{ action:"add", name, index? }` · `{ action:"rename", from, to }` · `{ action:"remove", name }`(빈 것만) · `{ action:"reorder", categories }` |
| GET | `/api/wiki/<space>/history/<slug>[?limit=]` | 읽기 | `{ entries: [{ rev, shortRev, author, date, message, path, status(A/M/D/R), slug }] }`. 이름이 바뀌어도 따라간다 |
| GET | `/api/wiki/<space>/revisions/<slug>?rev=` | 읽기 | 그 커밋 때의 `{ raw, body, frontmatter, title, deleted, … }` |
| GET | `/api/wiki/<space>/diff/<slug>?from=&to=` | 읽기 | `to` 를 비우면 지금 파일과 비교하고, `from=empty` 면 빈 문서와 비교. `{ added, removed, unified, hunks, lines:[{ type:add/del/ctx, text, oldNo, newNo }] }` |
| POST | `/api/wiki/<space>/revert/<slug>` | 쓰기 | `{ rev, baseRev?, message? }` 그 버전 내용으로 새 커밋. 지워진 문서면 되살린다 |
| GET | `/api/wiki/<space>/trash` | 읽기 | 지워진 문서 목록 `{ slug, title, deletedAt, deletedBy, rev }`. 되살리기는 revert 에 이력의 rev 를 넣는다 |
| POST | `/api/wiki/<space>/uploads` | 쓰기 | multipart `file`(+ 선택 `doc`) → 201 `{ url, path, name, size, type, image }` |
| GET | `/api/wiki/<space>/files/<yyyy-mm>/<name>` | 읽기 | 업로드 파일. 부원 파일은 이 경로로만 받을 수 있다 |
| GET | `/uploads/<yyyy-mm>/<name>` | 누구나 | 공개 업로드. 서버를 켠 뒤에 올라온 파일도 받을 수 있게 하는 대체 경로 |
| GET | `/api/wiki/<space>/comments/<slug>` | 댓글 보기 | `{ comments: [{ id, author, body, createdAt, updatedAt, deleted, replies[], anchor?, resolved?, likes?, mentions? }], people, me }`. `people` 은 @부르기 후보(이 공간에 댓글을 쓴·불린 사람 + 나) |
| POST | `/api/wiki/<space>/comments/<slug>` | 쓰기 | `{ body, parentId?, anchor?, mentions? }` 답글은 한 단계까지. `anchor` 는 맨 위 댓글만 — `{ quote, prefix, suffix, block?, heading? }` (본문 글 자리, `lib/wiki/anchor.ts`). `mentions` 는 `[{ memberId, name }]` |
| PATCH | `/api/wiki/<space>/comments/<slug>` | 쓰기 | `{ id, body, mentions? }` 고치기(내 것만) · `{ id, resolved: true\|false }` 해결/다시 열기 · `{ id, like: true\|false }` 좋아요(사람마다 한 번) |
| DELETE | `/api/wiki/<space>/comments/<slug>?id=` | 쓰기(내 것) / 부장 | 답글이 달린 댓글은 내용만 지우고 자리를 남긴다 |
| GET | `/api/wiki/guide/sync` | 쓰기 | 자동 push 상태 `{ enabled, pending, failures, lastError, lastSuccessAt, nextAttemptAt }` |
| POST | `/api/wiki/guide/sync` | 부장 | 지금 바로 pull --rebase + push |

### 리비전과 충돌

- 문서의 `rev` 는 지금 파일 내용의 git 블롭 해시다(`git hash-object` 와 같은 값). 편집기는 문서를 열 때 받은 `rev` 를 저장할 때 `baseRev` 로 돌려보낸다.
- 그 사이 누가 저장했으면 `409 { error:"conflict", currentRev, current:{ raw, title } }` 가 온다. 다시 받아 합친 뒤 새 `currentRev` 로 저장하면 된다.
- 이력·diff·revert 에 쓰는 `rev` 는 커밋 해시다(짧은 것도 된다).
- `frontmatter` 로 저장하면 지금 frontmatter 위에 덮어쓰고, 값을 `null` 로 준 키는 지운다. `raw` 를 주면 그 원문을 그대로 쓴다.

## CUE 연동 (같은 PC 의 ONAIR 채팅 도우미가 위키를 읽기)

CUE(ONAIR 서버 안의 Python 도우미)가 질문에 답할 때 최신 문서를 찾아 읽을 수 있게, **같은 PC 에서만·읽기만** 되는 길을 하나 둔다.

### 머리글

| 머리글 | 값 |
| --- | --- |
| `X-Offair-Service` | `OFFAIR_SERVICE_TOKEN` 과 같은 값 (해시 뒤 timing-safe 비교) |
| `X-Offair-As-Role` | 누구 대신 읽는지: `superadmin` · `lead` · `member` · `alumni` · `teacher` · `guest`. 그 밖의 값·없음 = `guest` |
| `X-Offair-As-Name` | 그 사람 이름, URL 인코딩 (`encodeURIComponent`). 없으면 `CUE` (손님이면 `손님`) |

규칙 (`lib/wiki/auth.ts` 의 `serviceViewer`):

- `OFFAIR_SERVICE_TOKEN` 이 비어 있으면 기능이 꺼져 있고 `X-Offair-Service` 는 무시한다(보통 손님 요청).
- 토큰이 틀리면 **403**.
- 실제 소켓 주소가 `127.0.0.1`/`::1`(`::ffff:127.0.0.1` 포함)이 아니면 **403**. `X-Forwarded-For` 는 보지 않는다.
  소켓 주소는 서버가 켜질 때 `instrumentation.ts` 가 `http.Server` 의 `request` 를 감싸 `x-offair-peer: <주소>;<프로세스 난수>` 로 덮어써 붙인다(`lib/wiki/peer.ts`). 들어온 요청이 같은 머리글을 보내도 덮어쓰고, 난수가 다르면 믿지 않는다.
- Cloudflare 를 거친 흔적(`Cf-Connecting-Ip`·`Cf-Ray`·`Cf-Visitor`·`Cf-Ipcountry`, `CDN-Loop: cloudflare`)이 있으면 **403** — 터널(cloudflared)은 같은 PC 에서 붙어 소켓 주소가 127.0.0.1 이기 때문이다.
- GET·HEAD 말고는 **403** (읽기 전용). 댓글·저장·업로드 모두 안 된다.
- 통과하면 그 역할의 보통 권한 그대로다. 부원 공간은 `member`·`lead`·`superadmin`·`alumni` 대리일 때만 읽히고, `teacher` 는 403, `guest` 는 401.
- ONAIR 는 부르지 않는다(대리 역할은 CUE 가 이미 확인한 사람의 역할을 넘기는 것). 그래서 토큰은 ONAIR `.env` 와 OFFAIR env 에만 둔다.

### 쓰는 API

| 메서드 | 경로 | 응답 |
| --- | --- | --- |
| GET | `/api/wiki/<space>/search?q=<말>&limit=<1~20, 기본 8>` | `{ space, q, limit, total, results: [{ url, path, slug, space, title, category, description, snippet, heading, score, updatedAt }] }`. `url` 은 `OFFAIR_PUBLIC_URL` 이 있으면 절대 주소, `path` 는 언제나 사이트 안 경로. 공간마다 따로 부른다 |
| GET | `/api/wiki/<space>/docs/<slug>?format=text[&section=<소제목>]` | `{ space, slug, title, description, category, url, path, updatedAt, updatedBy, headings, text, section? }`. 소제목을 못 찾으면 404 `{ error:"not_found", headings:[…] }` |

`text` 는 LLM 이 읽기 좋은 평범한 마크다운이다(`lib/wiki/llm-text.ts`, 편집기와 같은 파서·`singleTilde:false`). 머리말은 빠지고(제목·설명은 따로), 컴포넌트는 이렇게 바뀐다:

| MDX | text |
| --- | --- |
| `<Callout type="warn" title="T">본문</Callout>` | `> [주의] T: 본문` (줄마다 `>`; 종류: warn 주의·info 정보·tip 팁·note 메모·danger 경고) |
| `<Steps><Step title="A">…</Step></Steps>` | `1. **A**` + 3칸 들여 쓴 본문 |
| `<Figure caption="C" alt="A" />` | `[그림: C (A)]` (하나만 있으면 그것만) |
| `<CardGrid><Card title="T" href="/x">설명</Card></CardGrid>` | `- T — /x · 설명` |
| `<Kbd>⌘</Kbd>` · `<Badge>새</Badge>` | `` `⌘` `` · `새` |
| `<YouTube id="…" start={30} title="T" />`, 예전 `[T](주소 "youtube")` | `[영상: T https://www.youtube.com/watch?v=…&t=30s]` |
| 표 · 코드 블록 | GFM 그대로 |
| `import`/`export` · `{식}` · HTML | 버림 (모르는 컴포넌트는 속 글만) |

`section` 은 그 소제목(글자 같음 → 없으면 들어 있음, 대소문자 무시)부터 같거나 더 높은 단계 소제목 전까지다.

### 예시

```bash
# 서버 PC 에서 (PowerShell 이면 curl.exe)
curl -s "http://127.0.0.1:3000/api/wiki/guide/search?q=%EC%8B%9C%EB%B3%B4&limit=5" \
  -H "X-Offair-Service: $OFFAIR_SERVICE_TOKEN" -H "X-Offair-As-Role: member" \
  -H "X-Offair-As-Name: %EA%B9%80%EB%B6%80%EC%9B%90"

curl -s "http://127.0.0.1:3000/api/wiki/members/docs/meeting/2026-11?format=text&section=%EC%95%88%EA%B1%B4" \
  -H "X-Offair-Service: $OFFAIR_SERVICE_TOKEN" -H "X-Offair-As-Role: alumni"
```

주소는 터널 공개 주소가 아니라 **반드시 `http://127.0.0.1:<포트>`** 로 부른다 (공개 주소로 부르면 Cloudflare 를 거쳐 403).

## 저장·백업·push 흐름

1. 쓰기 요청은 저장소마다 하나의 줄(mutex)에서 차례로 돈다.
2. 파일은 임시 파일에 쓴 뒤 바꿔치기한다(줄바꿈은 언제나 `\n`). 바뀐 경로만 `git add` 하고 `git commit -- <경로>` 한다. 작업 폴더의 다른 변경은 건드리지 않는다. 작성자는 로그인한 사람 이름, 메시지는 `docs :: 「제목」 수정` 형식이고 편집 요약은 커밋 본문에 들어간다.
3. 커밋이 실패하면 파일을 원래대로 되돌리고 500 을 돌려준다.
4. 공개 공간 커밋이 생기면 debounce(기본 30초) 뒤 `git pull --rebase --autostash` 를 하고 `git push` 한다. 실패하면 `logs/push.log` 에 남기고 30초, 1분, 2분… 최대 15분 간격으로 다시 시도한다. 저장은 막지 않는다. 서버를 다시 켜면 한 번 더 시도한다.
5. 공개 문서 페이지는 정적 생성(ISR)이다. 저장 API 가 `revalidatePath('/', 'layout')` 를 불러 다음 방문 때 새로 그린다. 바깥에서 파일이 바뀐 경우(git pull 등)에 대비해 루트 레이아웃에 `revalidate = 300` 도 걸어 두었다.
6. 백업: 공개 공간은 GitHub 이 곧 백업이다. **부원 공간과 댓글은 데이터 폴더에만 있으므로** 데이터 폴더 전체를 주기적으로 다른 디스크에 복사해야 한다(부원 저장소는 `git bundle create` 로 한 파일로 만들 수도 있다).

## 서버 PC 에 배포할 때 해야 할 일 (이 작업에서는 아무것도 설정하지 않았다)

1. **Cloudflare Access 앱**: 편집·부원 화면 경로(예: `/edit*`, `/members*`, `/api/wiki/members/*`)를 덮는 self-hosted 앱을 만들고 부원 이메일 정책을 건다. 공개 문서와 `/api/me`, `/api/wiki/guide/*` 읽기는 Access 밖에 둬도 된다. 로그인한 브라우저는 `CF_Authorization` 쿠키를 보내므로 서버가 신원을 알 수 있다. 쿠키가 호스트 전체 경로로 가는지는 배포 때 확인해야 한다.
2. **AUD 등록**: 그 Access 앱의 Application Audience(AUD) 태그를 ONAIR 서버 `.env` 의 `CF_ACCESS_AUD` 에 콤마로 덧붙이고 ONAIR 를 다시 켠다. ONAIR 코드는 바꿀 필요가 없다.
3. **push 자격 증명**: 서버를 돌리는 Windows 계정에서 OFFAIR-V2 저장소에 push 할 수 있어야 한다. 이 저장소에만 쓰기 권한이 있는 fine-grained PAT(Git Credential Manager 에 저장)나 deploy key(SSH) 중 하나를 쓴다. 프롬프트는 띄우지 않으므로(`GIT_TERMINAL_PROMPT=0`) 자격 증명이 없으면 `push.log` 에 실패로만 남는다. `main` 에 브랜치 보호가 있으면 push 가 거부되니 예외를 주거나 `OFFAIR_GIT_BRANCH` 를 따로 정한다. push 할 때마다 Vercel 빌드가 돌기 때문에 빌드가 너무 잦으면 `OFFAIR_GIT_PUSH_DEBOUNCE_MS` 를 늘린다(예: 300000).
4. **git**: Git for Windows 를 설치한다. 저장소 폴더 소유자와 서버 실행 계정이 다르면 `git config --global --add safe.directory <경로>` 가 필요할 수 있다.
5. **환경 변수**: `.env.local` 등에 `OFFAIR_GIT_PUSH=1`, `OFFAIR_DATA_DIR=<저장소 밖 경로 권장, 예: D:\offair-data>`, `ONAIR_API_BASE` 를 넣는다. `OFFAIR_DEV_ROLE` 은 넣지 않는다(production 에서는 어차피 무시된다).
6. **실행**: `npm run build` 뒤 `next start -H 127.0.0.1` 처럼 터널에서만 들어오게 묶는다. 신원은 ONAIR 가 토큰을 검증해서 정하므로 우회해도 권한이 생기지는 않지만, 바깥에서 직접 들어올 길은 닫아 두는 편이 낫다.
7. **백업**: 데이터 폴더를 백업 대상에 넣는다.

## 기존 dev 전용 `/edit`

그대로 둔다. `npm run dev` 에서만 열리고, 파일을 직접 쓰며 **커밋하지 않는다**(예전 동작). 저장소는 파일 mtime 으로 캐시하므로 `/edit` 로 고친 내용도 바로 보인다. 새 위키 편집기가 생기면 지운다.

## 테스트

```bash
npm test   # node:test + tsx. 임시 폴더에 git 저장소를 만들어 돌린다
```

경로 안전, 저장 충돌(409), 커밋·이력·diff·되돌리기, 부원 공간 격리, 역할별 권한 표(ONAIR 응답은 흉내), 업로드, 댓글, 자동 push(로컬 bare 원격)를 다룬다.
