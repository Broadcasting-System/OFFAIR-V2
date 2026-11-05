/** GET /login?next= — Access 로그인을 마치고 돌아오면 원래 주소로 보낸다 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "@/app/login/route";

test("/login 은 next 로 303, 바깥 주소는 / 로", () => {
  const ok = GET(new Request("http://wiki.test/login?next=%2Fmembers%2F%25EA%25B8%2588"));
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get("location"), "/members/%EA%B8%88");
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const bad = GET(new Request("http://wiki.test/login?next=%2F%2Fevil.com"));
  assert.equal(bad.headers.get("location"), "/");
});
