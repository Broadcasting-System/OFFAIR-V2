import "server-only";
import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode, {
  type Options as PrettyCodeOptions,
} from "rehype-pretty-code";
import { mdxComponents } from "@/components/mdx/mdx-components";

const prettyCodeOptions: PrettyCodeOptions = {
  // 라이트/다크 두 테마를 함께 내보낸다 (색은 globals.css 에서 --shiki-light/dark 로 고름)
  theme: { light: "github-light", dark: "github-dark-default" },
  keepBackground: false,
  defaultLang: "plaintext",
};

/**
 * Compile + render an MDX source string on the server (RSC).
 * Custom components from `mdxComponents` are made available to every doc, so
 * authors can use <Callout>, <Steps>, <Figure>, ``` code fences, etc. freely.
 */
export async function MDX({ source }: { source: string }) {
  const { default: Content } = await evaluate(source, {
    ...runtime,
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeSlug, [rehypePrettyCode, prettyCodeOptions]],
  });

  return <Content components={mdxComponents} />;
}
