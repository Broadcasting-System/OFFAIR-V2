import "server-only";
import fs from "node:fs";
import path from "node:path";

export interface CtaConfig {
  label: string;
  href: string;
}
export interface HomeConfig {
  eyebrow: string;
  title: string;
  description: string;
  primaryCta: CtaConfig;
  secondaryCta: CtaConfig;
}

export const HOME_CONFIG_FILE = path.join(process.cwd(), "content", "home.json");

export const HOME_DEFAULTS: HomeConfig = {
  eyebrow: "BSSM Broadcast Guide Book",
  title: "OFFAIR",
  description:
    "부산소프트웨어마이스터고 방송부의 모든 것. 장비 세팅부터 송출, 음향, 운영 매뉴얼까지 — 처음 들어온 부원도 바로 방송할 수 있도록.",
  primaryCta: { label: "가이드 시작하기", href: "/docs/getting-started" },
  secondaryCta: { label: "문서 기여하기", href: "/contribution" },
};

/** Hero / landing copy, editable from `content/home.json` via the edit UI. */
export function getHomeConfig(): HomeConfig {
  try {
    if (fs.existsSync(HOME_CONFIG_FILE)) {
      const j = JSON.parse(fs.readFileSync(HOME_CONFIG_FILE, "utf8"));
      return {
        ...HOME_DEFAULTS,
        ...j,
        primaryCta: { ...HOME_DEFAULTS.primaryCta, ...j?.primaryCta },
        secondaryCta: { ...HOME_DEFAULTS.secondaryCta, ...j?.secondaryCta },
      };
    }
  } catch {
    /* malformed — fall back to defaults */
  }
  return HOME_DEFAULTS;
}
