# OFFAIR 위키 백엔드

OFFAIR 를 학교 서버 PC 에서 도는 위키로 쓰기 위한 서버 쪽 구조다.
문서는 지금처럼 디스크의 MDX 파일이고, 저장할 때마다 git 커밋이 하나씩 생긴다.

## 화면 주소

| 주소 | 무엇 | 렌더링 |
| --- | --- | --- |
| `/`, `/docs/<slug…>`, `/recent`, `/trash` | 가이드북(공개) | 정적 생성 + ISR (저장하면 `revalidatePath`) |
| `/members`, `/members/<slug…>` | 부원 공간 첫 화면·문서 | **요청마다** 권한 확인(`lib/wiki/server-viewer.ts`). 권한이 없으면 문서가 있든 없든 로그인 벽만 그린다. `generateStaticParams` 없음 |
| `/write/<space>/<slug…>` | 편집기 (`guide`·`members`) | 요청마다 권한 확인. 손님 → 로그인 벽, 읽기만 되는 사람(졸업생 등) → "편집 권한이 없어요". 저장은 `PUT /api/wiki/<space>/docs/<slug>` |
| `/login?next=<경로>` | 로그인 벽의 [로그인] | Cloudflare Access 가 지키는 경로. 통과하면 `next`(사이트 안 경로만)로 303 |
| `/onair` | ONAIR 상태·다시 켜기 | 요청마다 권한 확인. 부원 이상만 보이고, [ONAIR 다시 켜기] 는 부장·최고 관리자만. 아래 "ONAIR 다시 켜기" |

편집 주소는 언제나 `editHref(space, slug)`(`lib/wiki/links.ts`) 로 만든다 — 트리·검색·문서 위 막대·팔레트(E)·"새 문서"(트리 ＋, 팔레트 N)가 같은 규칙.
"새 문서" 는 `POST /api/wiki/<space>/docs` 로 먼저 만든 뒤 그 문서의 편집기를 연다. 게시하면 읽기 화면(`/docs/…`, `/members/…`)으로 돌아간다.

부원 문서는 빌드 결과·정적 HTML·루트 레이아웃에 들어가지 않는다: 서랍의 부원 트리는 브라우저가 `GET /api/wiki/members/tree` 로 받고(권한 확인), 검색은 `/api/wiki/members/search`, 문서 화면은 동적 렌더링이다.

## 로그인 벽과 Cloudflare Access

손님이 부원 공간·부원 문서·편집 화면을 열면 본문 자리에 "부원만 볼 수 있어요 … [로그인]" 카드가 나온다(`components/members/login-wall.tsx`).
[로그인] 은 `/login?next=<지금 주소>` 로 간다. 이 경로를 Access 앱이 지키므로:

1. 로그인 안 한 브라우저 → Access 로그인 화면(ONAIR 에 등록한 메일로 받은 코드)
2. 통과 → Access 가 `CF_Authorization` 쿠키를 심고 `/login?next=…` 로 돌려보냄
3. `app/login/route.ts` 가 `next` 로 303 → 사용자는 보던 문서로 돌아온다
4. 그 뒤 요청은 쿠키의 토큰을 ONAIR `GET /api/members/me` 가 검증해서 신원을 정한다 (`lib/wiki/auth.ts`)

이 방식이 가정하는 Access 설정:

- **self-hosted 앱 하나, 경로 `/login`** (호스트 예: `offair.bssmcast.com/login`). 정책은 ONAIR 와 같은 부원 이메일 허용.
- `/members*`·`/write*`·`/api/wiki/members/*` 는 Access 로 덮지 **않아도** 된다(서버가 쿠키로 직접 권한을 확인한다). 덮으면 손님에게 로그인 벽 대신 Access 화면이 먼저 나오고, `fetch` 로 부르는 API 가 Access 로그인 HTML 로 바뀌어 화면이 깨질 수 있으니 API 경로는 덮지 않는다.
- `CF_Authorization` 쿠키가 **호스트 전체(`Path=/`)** 로 보내져야 `/members` 등에서 신원을 안다. 배포 때 브라우저 개발자 도구로 쿠키의 Domain·Path 를 꼭 확인한다. 경로 앱의 쿠키가 `/login` 에만 묶이면, Access 앱 경로를 `/login` 과 함께 `/members`·`/write` 로 넓히고(이 경우 손님은 Access 화면을 먼저 본다) API 경로만 빼 둔다.
- 그 앱의 AUD 를 ONAIR `.env` 의 `CF_ACCESS_AUD` 에 덧붙인다(아래 배포 2번).
- 로그아웃은 내 메뉴의 [로그아웃] = `/cdn-cgi/access/logout` (Access 가 쿠키를 지운다).

개발에서는 Access 가 없으므로 `/login` 이 그냥 `next` 로 돌려보낸다. `OFFAIR_DEV_ROLE` 이 없으면 로그인 벽이 그대로 보이고, 있으면(예: `lead`) 내용이 보인다.

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
| `OFFAIR_ACCESS_TEAM` / `OFFAIR_ACCESS_AUD` | 없음 | ONAIR 가 꺼졌을 때 Access 토큰을 직접 확인할 팀 도메인(`bssmcast`)·AUD(콤마). 없으면 ONAIR 가 확인해 준 토큰에서 배운 값을 쓴다 |
| `OFFAIR_ACCESS_ROSTER_DAYS` | `30` | ONAIR 가 꺼졌을 때 믿는 "최근 로그인 기록" 의 유효 기간(일) |
| `OFFAIR_ONAIR_START_GAP_MS` | `60000` | ONAIR 다시 켜기 사이 최소 간격 |
| `ONAIR_START_SCRIPT` | 없음 | 'ONAIR 시작.cmd' 전체 경로. 없으면 바탕화면에서 찾는다 |

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
| GET | `/api/me` | 누구나 | `{ role, name, memberId, authenticated, cohort, roleLabel, canEdit, canReadMembers, canComment, canModerate, readOnly, onair: { canView, canStart } }`. `cohort`(기수)·`roleLabel` 은 ONAIR 가 주면 그대로. `onair` 는 ONAIR 상태 화면 메뉴용(아래 "ONAIR 다시 켜기") |
| GET | `/api/me/activity` | 로그인 | 내 메뉴: `{ mentions: [{ space, slug, url, title, id, threadId, author, body, createdAt, quote }], edits: [{ space, slug, url, title, category, date, message, rev }] }`. 읽을 수 있는 공간만. 고친 문서는 커밋 작성자 이메일 `<memberId>@<도메인>`(없으면 이름)으로 찾는다 |
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
| POST | `/api/wiki/<space>/uploads` | 쓰기 | multipart `file`(+ 선택 `doc`, `width`, `height`, `of`) → 201 `{ url, path, name, fileName, size, type, image }`. `of`(본 그림 주소)를 주면 표시 달기 보조 파일로 본 그림 옆에 `이름.base.<ext>` / `이름.marks.json` 으로 둔다(같은 이름이면 덮어씀, JSON 은 512KB 까지) |
| GET | `/api/wiki/<space>/uploads[?doc=&q=]` | 쓰기 | 올린 파일 목록(최근 것 먼저) `{ files: [{ url, name, fileName, size, kind, type, width?, height?, doc?, uploadedAt, sidecarUrl? }] }`. 보조 파일은 숨기고 본 그림에 `sidecarUrl` 로 붙인다. `doc` 은 올릴 때 기록된 문서만 |
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
| `<Callout type="warn" title="T">본문</Callout>` | `> [주의] T: 본문` (줄마다 `>`; 종류: warn 주의·info 정보·tip 팁·note 참고·danger 경고) |
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

## 서버 PC 설치 스크립트 (`scripts/windows/`)

- `OFFAIR 설치.cmd` — 온에어 폴더 아래 `OFFAIR-V2` 에 main 을 받고 `npm ci` → `npm run build`, 작업 스케줄러 `OFFAIR Autostart`(로그온 40초 뒤) 등록 후 위키를 켠다. Access 앱 AUD 를 넣으면 종·실시간 마이크·녹음이 없을 때 터널 설정(`onair-cloudflared\config.yml`)에 `offair.bssmcast.com → 127.0.0.1:3020` 을 넣어 터널만 다시 켜고, ONAIR `.env` 의 `CF_ACCESS_AUD` 에 AUD 를 덧붙여 ONAIR 서버(8000)만 다시 켠다. 바꾼 파일은 `.bak-offair` 사본이 남고 기록은 `온에어\offair-install-log.txt`. 새 main 으로 바꿀 때도 다시 실행하면 된다(AUD 는 엔터로 건너뜀).
- `OFFAIR 시작.cmd` — `next start --hostname 127.0.0.1 --port 3020` 을 최소화 창으로 띄우고 꺼지면 5초 뒤 다시 켠다. 기본 환경 변수는 `ONAIR_API_BASE=http://127.0.0.1:8000`, `OFFAIR_PUBLIC_URL=https://offair.bssmcast.com`, `OFFAIR_ALLOWED_ORIGINS=offair.bssmcast.com`, `OFFAIR_DATA_DIR=온에어\offair-data`, `OFFAIR_GIT_PUSH=0`. 바꾸려면 `온에어\offair.env` 에 `KEY=VALUE` 줄을 넣는다(push 자격 증명을 넣은 뒤 `OFFAIR_GIT_PUSH=1` 등).

## ONAIR 다시 켜기 (`/onair`)

ONAIR 서버(8000)가 통째로 꺼지면 ONAIR MCP·원격 도구도 같이 꺼져서, 지금까지는 서버 PC 에 원격으로 들어가야 했다.
OFFAIR 는 ONAIR 와 따로 돌기 때문에 그때 대신 켜는 길이 된다.

- 화면: 레일(모바일은 서랍 아래)의 [ONAIR 상태] → `/onair`. 서버(8000)·송출 화면(3000)·컨트롤(3001) 세 줄에 켜짐/꺼짐, 서버는 `GET /health` 가 `{"status":"healthy"}` 인지도 보인다.
- [ONAIR 다시 켜기] → 화면 안에서 한 번 더 확인 → `POST /api/onair/start`. 그 뒤 3초마다 다시 보고, 다 켜지거나 150초가 지나면 멈춘다.
- 하는 일: 이 계정 바탕화면(`[Environment]::GetFolderPath('Desktop')`, OneDrive 로 옮겨졌어도. 못 찾으면 `%USERPROFILE%\Desktop`)의 `ONAIR 시작.cmd` 를 `explorer.exe "<경로>"` 로 실행한다. 그 스크립트는 이미 열린 포트를 건너뛰므로 켜져 있는 것은 다시 켜지 않는다. explorer 를 거치면 OFFAIR 프로세스와 떨어져 돌고, OFFAIR 가 관리자 권한이어도 ONAIR 는 보통 권한으로 켜진다(관리자 권한 ONAIR 는 업데이트 스크립트를 깨뜨린 적이 있다).
- 막는 것: Windows 가 아니면 501, 셋 다 켜져 있으면 409 "이미 다 켜져 있어요", 60초 안에 다시 누르면 429, 스크립트가 없으면 503. 누가 눌렀는지는 `<데이터 폴더>/logs/onair-start.log` 에 남는다.
- OFFAIR 는 로그온 세션에서 돌아야 한다(지금처럼 작업 스케줄러 '로그온 시' → `OFFAIR 시작.cmd`). Windows 서비스(세션 0)로 돌리면 explorer 로 띄운 창이 보이지 않거나 실행되지 않는다.

| 메서드 | 경로 | 권한 | 설명 |
| --- | --- | --- | --- |
| GET | `/api/onair/status` | 부원·부장·최고 관리자 | `{ checkedAt, apps: [{ id, name, port, up, health? }], allUp, allDown, canStart, startSupported, identity: "onair"\|"recent" }` |
| POST | `/api/onair/start` | 부장·최고 관리자 | 같은 사이트에서 온 요청만(`Origin` 필수, `Sec-Fetch-Site` 가 있으면 `same-origin`). 202 `{ ok, launched: { script, via }, starting: [이름…], status }` |

### ONAIR 가 꺼졌을 때 누구인지 아는 법

평소 신원은 ONAIR 가 정하므로, ONAIR 가 꺼지면 모두 손님이 되어 단추를 누를 사람이 없어진다. 그래서 이 화면에서만(`lib/onair/viewer.ts`):

1. ONAIR 가 어떤 Access 토큰을 부원 이상으로 확인해 줄 때마다, 토큰 안의 이메일·발급자·AUD 와 ONAIR 가 준 역할을 `<데이터 폴더>/onair-access.json` 에 적는다 (`lib/onair/access.ts`).
2. ONAIR 가 답하지 않을 때(연결 실패·시간 초과·5xx)만, 요청의 토큰을 Cloudflare 공개 키(`https://<팀>.cloudflareaccess.com/cdn-cgi/access/certs`)로 직접 확인한다 — RS256 서명, 1에서 배운(또는 env 의) 발급자·AUD, 만료.
3. 그 이메일이 명단에 있고 마지막 확인이 30일 안이면 그 역할로 본다. 위키 읽기·쓰기 권한은 바뀌지 않는다(그때도 손님).

그러니 부장은 **ONAIR 가 켜져 있을 때 OFFAIR 에 한 번 로그인해 두어야** 한다. 명단에 없거나 30일이 지났으면 화면이 "누구인지 확인하지 못했어요" 를 보여 주고, 그때는 예전처럼 원격으로 들어가 켠다.
명단은 ONAIR 가 켜져 있을 때 그 사람이 다시 들어오면 고쳐진다(역할이 졸업생·교사로 바뀌었으면 지움). ONAIR 에서 아예 빠진 사람(손님 답)은 토큰을 믿을 수 없어 지우지 않고 30일이 지나면 쓰지 않는다. 바로 막으려면 `onair-access.json` 에서 그 줄을 지우고 OFFAIR 를 다시 켠다.

## 서버 PC 에 배포할 때 해야 할 일 (이 작업에서는 아무것도 설정하지 않았다)

1. **Cloudflare Access 앱**: 위 "로그인 벽과 Cloudflare Access" 대로 `/login` 경로를 덮는 self-hosted 앱을 만들고 부원 이메일 정책을 건다. 공개 문서·API 는 Access 밖에 둔다. 쿠키(`CF_Authorization`)가 `Path=/` 로 가는지 꼭 확인한다.
2. **AUD 등록**: 그 Access 앱의 Application Audience(AUD) 태그를 ONAIR 서버 `.env` 의 `CF_ACCESS_AUD` 에 콤마로 덧붙이고 ONAIR 를 다시 켠다. ONAIR 코드는 바꿀 필요가 없다.
3. **push 자격 증명**: 서버를 돌리는 Windows 계정에서 OFFAIR-V2 저장소에 push 할 수 있어야 한다. 이 저장소에만 쓰기 권한이 있는 fine-grained PAT(Git Credential Manager 에 저장)나 deploy key(SSH) 중 하나를 쓴다. 프롬프트는 띄우지 않으므로(`GIT_TERMINAL_PROMPT=0`) 자격 증명이 없으면 `push.log` 에 실패로만 남는다. `main` 에 브랜치 보호가 있으면 push 가 거부되니 예외를 주거나 `OFFAIR_GIT_BRANCH` 를 따로 정한다. push 할 때마다 Vercel 빌드가 돌기 때문에 빌드가 너무 잦으면 `OFFAIR_GIT_PUSH_DEBOUNCE_MS` 를 늘린다(예: 300000).
4. **git**: Git for Windows 를 설치한다. 저장소 폴더 소유자와 서버 실행 계정이 다르면 `git config --global --add safe.directory <경로>` 가 필요할 수 있다.
5. **환경 변수**: `.env.local` 등에 `OFFAIR_GIT_PUSH=1`, `OFFAIR_DATA_DIR=<저장소 밖 경로 권장, 예: D:\offair-data>`, `ONAIR_API_BASE`, `OFFAIR_PUBLIC_URL=https://<공개 호스트>`, (CUE 를 쓰면) `OFFAIR_SERVICE_TOKEN=<긴 난수>` 를 넣는다. 터널이 Host 를 바꿔 쓰기가 403 이면 `OFFAIR_ALLOWED_ORIGINS` 도. `OFFAIR_DEV_*` 는 넣지 않는다(production 에서는 어차피 무시된다).
6. **실행**: `npm run build` 뒤 `next start -H 127.0.0.1` 처럼 터널에서만 들어오게 묶는다. 신원은 ONAIR 가 토큰을 검증해서 정하므로 우회해도 권한이 생기지는 않지만, 바깥에서 직접 들어올 길은 닫아 두는 편이 낫다.
7. **백업**: 데이터 폴더를 백업 대상에 넣는다.

## 기존 dev 전용 `/edit`

그대로 둔다. `npm run dev` 에서만 열리고, 실행 폴더의 `content/` 를 직접 쓰며 **커밋하지 않는다**(예전 동작 — `OFFAIR_GUIDE_REPO` 도 보지 않는다). 문서 편집은 새 편집기(`/write/…`)를 쓰고, `/edit/home`(홈 문구 `content/home.json`)만 아직 이 화면에서 고친다. 홈 문구 편집이 위키로 옮겨지면 지운다.

## 테스트

```bash
npm test   # node:test + tsx. 임시 폴더에 git 저장소를 만들어 돌린다
```

경로 안전, 저장 충돌(409), 커밋·이력·diff·되돌리기, 부원 공간 격리, 역할별 권한 표(ONAIR 응답은 흉내), 업로드·목록·표시 달기 보조 파일, 내 메뉴, 댓글, 자동 push(로컬 bare 원격), CUE 서비스 토큰·문서 글(format=text), 로그인 주소, ONAIR 다시 켜기(상태·권한·간격 제한·Windows 전용·스크립트 경로·ONAIR 가 꺼졌을 때 토큰 직접 확인)를 다룬다.
편집기 변환기 테스트(vitest)는 `tests/fixtures/content/` 의 문서 사본을 쓴다 — `content/` 를 비워도 테스트는 돈다.
