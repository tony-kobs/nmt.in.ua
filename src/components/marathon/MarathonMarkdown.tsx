import { MathText } from "@/components/ui/MathText";
import {
  markdownHeadingRank,
  parseSafeMarkdown,
  type MdInline,
} from "@/modules/marathons/daily/richText";
import css from "./marathon.module.css";

const HEADING_TAG = {
  2: "h2",
  3: "h3",
  4: "h4",
  5: "h5",
  6: "h6",
} as const;

function Inline({ nodes }: { nodes: MdInline[] }) {
  return nodes.map((node, index) => {
    if (node.type === "text") return <MathText key={index} text={node.text} />;
    if (node.type === "code") return <code key={index}>{node.text}</code>;
    if (node.type === "strong") {
      return (
        <strong key={index}>
          <Inline nodes={node.children} />
        </strong>
      );
    }
    if (node.type === "em") {
      return (
        <em key={index}>
          <Inline nodes={node.children} />
        </em>
      );
    }
    return (
      <a key={index} href={node.href} rel="noopener noreferrer">
        <Inline nodes={node.children} />
      </a>
    );
  });
}

/** Marathon intro and day materials. Formulas go through MathText; HTML is not raw. */
export function MarathonMarkdown({ source }: { source: string }) {
  const blocks = parseSafeMarkdown(source);
  if (blocks.length === 0) return null;
  return (
    <div className={css.prose}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Tag = HEADING_TAG[markdownHeadingRank(block.level)];
          return (
            <Tag key={index}>
              <Inline nodes={block.children} />
            </Tag>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Inline nodes={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index}>
            <Inline nodes={block.children} />
          </p>
        );
      })}
    </div>
  );
}
