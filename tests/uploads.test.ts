/**
 * 업로드 목록과 표시 달기 보조 파일(이름.base.webp · 이름.marks.json), 내 메뉴(나를 부른 댓글·내가 고친 문서).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import * as h from "@/lib/wiki/handlers";
import { PNG_1PX, bodyOf, makeSandbox, mockOnair, req, type FetchMock, type Sandbox } from "./helpers";

let sb: Sandbox;
let onair: FetchMock;
beforeEach(() => {
  sb = makeSandbox({ ONAIR_API_BASE: "http://onair.test" });
  onair = mockOnair();
});
afterEach(() => {
  onair.restore();
  sb.cleanup();
});

const G = { space: "guide" };

function form(file: File, fields: Record<string, string> = {}) {
  const f = new FormData();
  f.set("file", file);
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const png = (name: string) => new File([PNG_1PX], name, { type: "image/png" });
const up = async (space: string, f: FormData, token = "tok-member") => h.upload(req("POST", "/x", { token, form: f }), { space });
const list = async (space: string, qs = "", token = "tok-member") =>
  (await bodyOf(await h.uploads(req("GET", `/api/wiki/${space}/uploads${qs}`, { token }), { space }))).files as Record<string, unknown>[];

describe("업로드 목록", () => {
  test("공간마다·문서마다, 이름 검색, 최근 것 먼저, 크기 기록", async () => {
    await up("guide", form(png("믹서.png"), { doc: "audio/mixer", width: "640", height: "480" }));
    await up("guide", form(png("시보 화면.png"), { doc: "onair/time" }));
    await up("members", form(png("회의.png"), { doc: "meeting" }));

    const all = await list("guide");
    assert.equal(all.length, 2);
    assert.deepEqual(all.map((f) => f.name), ["시보 화면.png", "믹서.png"]);
    const mixer = all.find((f) => f.name === "믹서.png")!;
    assert.equal(mixer.kind, "image");
    assert.equal(mixer.width, 640);
    assert.equal(mixer.doc, "audio/mixer");
    assert.match(String(mixer.url), /^\/uploads\/\d{4}-\d{2}\//);

    assert.deepEqual((await list("guide", "?doc=onair/time")).map((f) => f.name), ["시보 화면.png"]);
    assert.deepEqual((await list("guide", "?q=믹서")).map((f) => f.name), ["믹서.png"]);
    const mem = await list("members");
    assert.equal(mem.length, 1);
    assert.match(String(mem[0].url), /^\/api\/wiki\/members\/files\//);
  });

  test("목록은 편집할 수 있는 사람만 (손님 401, 졸업생 403)", async () => {
    assert.equal((await h.uploads(req("GET", "/x"), G)).status, 401);
    assert.equal((await h.uploads(req("GET", "/x", { token: "tok-alumni" }), G)).status, 403);
  });
});

describe("표시 달기 보조 파일", () => {
  test("본 그림 옆에 이름을 맞춰 두고, 목록에서는 숨기고 sidecarUrl 로 붙인다", async () => {
    const main = await bodyOf(await up("guide", form(png("시보.png"), { doc: "onair/time" })));
    const mainUrl = String(main.url);
    const stem = String(main.fileName).replace(/\.png$/, "");

    const base = await bodyOf(await up("guide", form(png("아무거나.base.png"), { of: mainUrl })));
    assert.equal(base.fileName, `${stem}.base.png`);
    assert.equal(path.dirname(String(base.url)), path.dirname(mainUrl), "같은 월 폴더");

    const marks = JSON.stringify({ v: 1, marks: [{ kind: "badge", n: 1 }] });
    const sc = await bodyOf(await up("guide", form(new File([marks], "x.marks.json", { type: "application/json" }), { of: mainUrl })));
    assert.equal(sc.fileName, `${stem}.marks.json`);

    // 같은 이름이면 덮어쓴다
    const again = await up("guide", form(new File([JSON.stringify({ v: 2 })], "x.marks.json"), { of: mainUrl }));
    assert.equal(again.status, 201);
    const onDisk = fs.readFileSync(path.join(sb.guide, "public", decodeURIComponent(String(sc.url)).replace(/^\//, "")), "utf8");
    assert.deepEqual(JSON.parse(onDisk), { v: 2 });

    const files = await list("guide");
    assert.equal(files.length, 1, "보조 파일은 숨긴다");
    assert.equal(files[0].sidecarUrl, sc.url);

    // 사이드카도 /uploads 대체 경로로 받을 수 있다 (JSON, 부원만)
    const parts = String(sc.url).replace("/uploads/", "").split("/");
    assert.equal((await h.publicUpload(req("GET", String(sc.url)), { path: parts })).status, 401);
    const res = await h.publicUpload(req("GET", String(sc.url), { token: "tok-member" }), { path: parts });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json");
  });

  test("본 그림이 없거나 다른 공간·이름이 이상하면 거부, of 없이 보조 이름은 400", async () => {
    const main = await bodyOf(await up("guide", form(png("a.png"))));
    const st = async (f: FormData, space = "guide") => (await up(space, f)).status;
    assert.equal(await st(form(png("a.base.png"))), 400, "of 없이 보조 파일 이름");
    assert.equal(await st(form(new File(["{}"], "a.marks.json"))), 400);
    assert.equal(await st(form(png("a.base.png"), { of: "/uploads/2020-01/nope.png" })), 404);
    assert.equal(await st(form(png("a.base.png"), { of: "https://evil.example/x.png" })), 400);
    assert.equal(await st(form(png("a.base.png"), { of: String(main.url) }), "members"), 400, "다른 공간의 그림");
    assert.equal(await st(form(new File(["not json"], "a.marks.json"), { of: String(main.url) })), 400);
    assert.equal(await st(form(png("a.thumb.png"), { of: String(main.url) })), 400);
    // .json 은 사이드카가 아니면 읽기 경로에서도 막는다
    const r = await h.publicUpload(req("GET", "/x", { token: "tok-member" }), { path: ["2026-01", "x.json"] });
    assert.equal(r.status, 400);
  });
});

describe("내 메뉴 (GET /api/me/activity)", () => {
  test("나를 부른 댓글과 내가 고친 문서 — 읽을 수 있는 공간만", async () => {
    const intro = { space: "guide", slug: ["intro"] };
    await h.addComment(
      req("POST", "/x", { token: "tok-member2", body: { body: "@김부원 확인해 주세요", mentions: [{ memberId: "m-1", name: "김부원" }], anchor: { quote: "방송부", prefix: "", suffix: "" } } }),
      intro
    );
    const got = await bodyOf(await h.getDoc(req("GET", "/x", { token: "tok-member" }), intro));
    await h.saveDoc(req("PUT", "/x", { token: "tok-member", body: { baseRev: got.rev, body: "\n고침\n" } }), intro);
    await h.createDoc(req("POST", "/x", { token: "tok-member", body: { title: "부원 메모", category: "메모" } }), { space: "members" });

    const a = await bodyOf(await h.activity(req("GET", "/api/me/activity", { token: "tok-member" })));
    const mentions = a.mentions as { title: string; url: string; author: { name: string }; quote: string }[];
    assert.equal(mentions.length, 1);
    assert.equal(mentions[0].title, "소개");
    assert.equal(mentions[0].url, "/docs/intro");
    assert.equal(mentions[0].author.name, "이부원");
    assert.equal(mentions[0].quote, "방송부");
    const edits = a.edits as { space: string; title: string }[];
    assert.deepEqual(edits.map((e) => `${e.space}:${e.title}`).sort(), ["guide:소개", "members:부원 메모"]);

    // 다른 사람에게는 내 것이 안 나온다
    const b = await bodyOf(await h.activity(req("GET", "/x", { token: "tok-member2" })));
    assert.equal((b.mentions as unknown[]).length, 0);
    assert.equal((b.edits as unknown[]).length, 0);
    // 교사는 어느 공간 기록도 못 본다, 손님은 401
    const t = await bodyOf(await h.activity(req("GET", "/x", { token: "tok-teacher" })));
    assert.deepEqual(t.edits, []);
    assert.equal((await h.activity(req("GET", "/x"))).status, 401);
  });
});
