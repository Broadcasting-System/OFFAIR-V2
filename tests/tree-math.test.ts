import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  MoveError,
  buildForest,
  keyOf,
  keyboardTarget,
  planMove,
  sameLayout,
  sidebarPayload,
  uniqueChildSlug,
  type TGroup,
} from "@/lib/wiki/tree-math";

const d = (slug: string, title = slug) => ({ slug: slug.split("/"), title });

function sample(): TGroup[] {
  return [
    { category: "시작하기", items: [d("intro"), d("rules")] },
    { category: "ONAIR", items: [d("start"), d("files"), d("main"), d("time"), d("time/device"), d("media")] },
    { category: "빈 칸", items: [] },
  ];
}

const keys = (gs: TGroup[]) => gs.map((g) => g.items.map(keyOf));

describe("트리 모양", () => {
  test("슬러그 앞부분이 같으면 하위로", () => {
    const f = buildForest(sample()[1].items);
    assert.deepEqual(f.map((n) => keyOf(n.doc)), ["start", "files", "main", "time", "media"]);
    assert.deepEqual(f[3].children.map((n) => keyOf(n.doc)), ["time/device"]);
  });
});

describe("planMove", () => {
  test("같은 카테고리 안에서 아래로 (시안: 파일 관리를 메인 화면 아래로)", () => {
    const p = planMove(sample(), "files", { type: "after", key: "main" });
    assert.deepEqual(keys(p.groups)[1], ["start", "main", "files", "time", "time/device", "media"]);
    assert.deepEqual(p.renames, []);
  });

  test("하위가 있는 문서 뒤(after)는 하위까지 지난 자리", () => {
    const p = planMove(sample(), "start", { type: "after", key: "time" });
    assert.deepEqual(keys(p.groups)[1], ["files", "main", "time", "time/device", "start", "media"]);
  });

  test("다른 카테고리로 옮기면 그 카테고리 순서에 끼운다", () => {
    const p = planMove(sample(), "media", { type: "before", key: "rules" });
    assert.deepEqual(keys(p.groups), [["intro", "media", "rules"], ["start", "files", "main", "time", "time/device"], []]);
  });

  test("문서 위에 놓으면 하위로 — 슬러그가 부모 아래로 바뀐다", () => {
    const p = planMove(sample(), "files", { type: "inside", key: "time" });
    assert.deepEqual(p.renames, [{ from: ["files"], to: ["time", "files"] }]);
    assert.deepEqual(keys(p.groups)[1], ["start", "main", "time", "time/device", "time/files", "media"]);
  });

  test("부모를 옮기면 하위도 함께 (슬러그·카테고리)", () => {
    const p = planMove(sample(), "time", { type: "category", category: "빈 칸", at: "end" });
    assert.deepEqual(keys(p.groups)[2], ["time", "time/device"]);
    assert.deepEqual(p.renames, []);
    const q = planMove(sample(), "time", { type: "inside", key: "intro" });
    assert.deepEqual(q.renames, [
      { from: ["time"], to: ["intro", "time"] },
      { from: ["time", "device"], to: ["intro", "time", "device"] },
    ]);
    assert.deepEqual(keys(q.groups)[0], ["intro", "intro/time", "intro/time/device", "rules"]);
  });

  test("하위를 바깥으로 꺼내면 슬러그 앞부분이 빠진다", () => {
    const p = planMove(sample(), "time/device", { type: "after", key: "media" });
    assert.deepEqual(p.renames, [{ from: ["time", "device"], to: ["device"] }]);
    assert.deepEqual(keys(p.groups)[1], ["start", "files", "main", "time", "media", "device"]);
  });

  test("자기 안으로·같은 주소는 막는다", () => {
    assert.throws(() => planMove(sample(), "time", { type: "inside", key: "time/device" }), MoveError);
    const g = sample();
    g[0].items.push(d("device"));
    assert.throws(() => planMove(g, "time/device", { type: "after", key: "media" }), /같은 주소/);
  });

  test("제자리면 배치가 같다", () => {
    const p = planMove(sample(), "files", { type: "after", key: "start" });
    assert.ok(sameLayout(p.groups, sample()));
  });
});

describe("키보드로 옮기기", () => {
  test("⌥↑/⌥↓ 는 형제 사이, 끝이면 옆 카테고리로", () => {
    const g = sample();
    assert.deepEqual(keyboardTarget(g, "files", "up"), { type: "before", key: "start" });
    assert.deepEqual(keyboardTarget(g, "files", "down"), { type: "after", key: "main" });
    assert.deepEqual(keyboardTarget(g, "start", "up"), { type: "category", category: "시작하기", at: "end" });
    assert.deepEqual(keyboardTarget(g, "media", "down"), { type: "category", category: "빈 칸", at: "start" });
    assert.equal(keyboardTarget(g, "time/device", "up"), null);
  });

  test("⌥→ 는 바로 위 형제 안으로, ⌥← 는 부모 다음으로", () => {
    const g = sample();
    assert.deepEqual(keyboardTarget(g, "files", "in"), { type: "inside", key: "start" });
    assert.equal(keyboardTarget(g, "start", "in"), null);
    assert.deepEqual(keyboardTarget(g, "time/device", "out"), { type: "after", key: "time" });
    assert.equal(keyboardTarget(g, "files", "out"), null);
  });

  test("키보드 목적지를 planMove 에 넣으면 실제로 한 칸 움직인다", () => {
    const g = sample();
    const p = planMove(g, "files", keyboardTarget(g, "files", "down")!);
    assert.deepEqual(keys(p.groups)[1].slice(0, 3), ["start", "main", "files"]);
  });
});

describe("도우미", () => {
  test("sidebarPayload 와 uniqueChildSlug", () => {
    assert.deepEqual(sidebarPayload(sample()).groups[0], { category: "시작하기", items: ["intro", "rules"] });
    assert.deepEqual(uniqueChildSlug(sample(), ["time"], "device"), ["time", "device-2"]);
    assert.deepEqual(uniqueChildSlug(sample(), null, "new"), ["new"]);
  });
});
