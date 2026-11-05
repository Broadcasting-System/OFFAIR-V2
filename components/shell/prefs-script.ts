/**
 * 화면 설정 키와, 첫 칠하기 전에 <head> 에서 실행되는 인라인 스크립트.
 * (서버 컴포넌트인 app/layout.tsx 가 문자열을 그대로 써야 해서 "use client" 파일과 분리)
 */

export type Panel = "drawer" | "toc";

export const PANEL_ATTR: Record<Panel, string> = {
  drawer: "data-drawer",
  toc: "data-toc",
};
export const PANEL_KEY: Record<Panel, string> = {
  drawer: "offair-drawer",
  toc: "offair-toc",
};
export const THEME_KEY = "offair-theme";

/** 저장된 테마를 붙이고, 서랍·목차는 저장값 또는 기본값(1280px 이상이면 열림)으로. */
export const PREFS_SCRIPT = `(function(){var d=document.documentElement;function g(k){try{return localStorage.getItem(k)}catch(e){return null}}var t=g("${THEME_KEY}");if(t==="light"||t==="dark")d.setAttribute("data-theme",t);var w=window.matchMedia("(min-width: 1280px)").matches;function p(k,a){var v=g(k);d.setAttribute(a,v==="open"||v==="closed"?v:(w?"open":"closed"))}p("${PANEL_KEY.drawer}","${PANEL_ATTR.drawer}");p("${PANEL_KEY.toc}","${PANEL_ATTR.toc}")})()`;
