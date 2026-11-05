import { describe, expect, it } from "vitest";
import { fitWithin, formatBytes, replaceExt, shouldUseConverted, shrinkMessage } from "../image";
import { checkFile, checkUpload, baseNameFor, sidecarNameFor, isAuxName } from "../files";

describe("그림 줄이기 크기 계산", () => {
  it("긴 변이 1920 을 넘으면 비율대로 줄인다", () => {
    expect(fitWithin(3840, 2160)).toEqual({ width: 1920, height: 1080, scaled: true });
    expect(fitWithin(1000, 3000)).toEqual({ width: 640, height: 1920, scaled: true });
    expect(fitWithin(2560, 1601)).toEqual({ width: 1920, height: 1201, scaled: true });
  });
  it("1920 이하면 그대로", () => {
    expect(fitWithin(1920, 1080)).toEqual({ width: 1920, height: 1080, scaled: false });
    expect(fitWithin(1280, 810)).toEqual({ width: 1280, height: 810, scaled: false });
  });
  it("아주 가는 그림도 1px 아래로 안 내려간다", () => {
    expect(fitWithin(10000, 1)).toEqual({ width: 1920, height: 1, scaled: true });
  });
  it("최대값을 바꿀 수 있다", () => {
    expect(fitWithin(1000, 500, 500)).toEqual({ width: 500, height: 250, scaled: true });
  });
});

describe("변환본을 쓸지", () => {
  it("줄였으면 크기와 상관없이 변환본", () => {
    expect(shouldUseConverted(100, 200, true)).toBe(true);
  });
  it("안 줄였으면 3% 이상 작을 때만", () => {
    expect(shouldUseConverted(1000, 960, false)).toBe(true);
    expect(shouldUseConverted(1000, 980, false)).toBe(false);
    expect(shouldUseConverted(1000, 1200, false)).toBe(false);
  });
});

describe("크기 글", () => {
  it("2.1MB → 380KB 로 줄여 올려요", () => {
    expect(shrinkMessage(Math.round(2.1 * 1024 * 1024), 380 * 1024)).toBe("2.1MB → 380KB 로 줄여 올려요");
  });
  it("줄지 않았으면 null", () => {
    expect(shrinkMessage(1000, 1000)).toBeNull();
  });
  it("단위", () => {
    expect(formatBytes(900)).toBe("900B");
    expect(formatBytes(4.2 * 1024 * 1024)).toBe("4.2MB");
    expect(formatBytes(12.4 * 1024 * 1024)).toBe("12MB");
  });
  it("확장자 바꾸기", () => {
    expect(replaceExt("시보-편집창.png", "webp")).toBe("시보-편집창.webp");
    expect(replaceExt("a.b.JPG", "webp")).toBe("a.b.webp");
    expect(replaceExt("noext", "webp")).toBe("noext.webp");
  });
});

describe("파일 허용 목록", () => {
  it("그림과 문서", () => {
    expect(checkFile({ name: "a.PNG", size: 10 })).toEqual({ ok: true, kind: "image" });
    expect(checkFile({ name: "설명서.pdf", size: 10 })).toEqual({ ok: true, kind: "file" });
    expect(checkFile({ name: "lnb_timer.json", size: 10 })).toEqual({ ok: true, kind: "file" });
  });
  it("막는 것", () => {
    expect(checkFile({ name: "x.exe", size: 1 }).ok).toBe(false);
    expect(checkFile({ name: "IMG_0001.HEIC", size: 1 }).ok).toBe(false);
    expect(checkFile({ name: "logo.svg", size: 1 }).ok).toBe(false);
    expect(checkFile({ name: "big.zip", size: 26 * 1024 * 1024 }).ok).toBe(false);
    expect(checkUpload("big.webp", 26 * 1024 * 1024)).not.toBeNull();
  });
  it("표시 달기 보조 파일 이름", () => {
    expect(baseNameFor("시보.webp")).toBe("시보.base.webp");
    expect(sidecarNameFor("시보.webp")).toBe("시보.marks.json");
    expect(isAuxName("시보.base.webp")).toBe(true);
    expect(isAuxName("시보.marks.json")).toBe(true);
    expect(isAuxName("base.webp")).toBe(false);
    expect(checkUpload("시보.marks.json", 100)).toBeNull();
  });
});
