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
  theme: "github-dark-default",
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
