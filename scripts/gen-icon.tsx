/**
 * 파비콘 만들기: components/offair-mark.tsx 그림을 그대로 SVG 파일로 뽑는다.
 *   npx tsx scripts/gen-icon.tsx [큰 그림 저장 경로]
 * → app/icon.svg (탭용 small). 경로를 주면 apple-icon·favicon.ico 를 구울 full 그림도 저장.
 */
import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OffairMark } from "../components/offair-mark";

const svg = (detail: "full" | "small") =>
  renderToStaticMarkup(createElement(OffairMark, { size: 120, detail }))
    .replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')
    .replace(/ class="[^"]*"| aria-hidden="true"/g, "");

writeFileSync("app/icon.svg", svg("small") + "\n");
if (process.argv[2]) writeFileSync(process.argv[2], svg("full"));
