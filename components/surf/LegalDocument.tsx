import type { ReactNode } from "react";
import styles from "./legal.module.css";

/** Renders a small, fixed Markdown subset as React elements. Deliberately does
 *  not use dangerouslySetInnerHTML: these documents are static, and building
 *  elements directly keeps an HTML injection path from existing at all. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1]) {
      nodes.push(<strong key={`${keyPrefix}-b${index}`}>{match[1]}</strong>);
    } else {
      const href = match[3];
      const external = href.startsWith("http");
      nodes.push(
        <a key={`${keyPrefix}-a${index}`} href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
          {match[2]}
        </a>,
      );
    }
    last = match.index + match[0].length;
    index += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function LegalDocument({ title, updated, body }: { title: string; updated?: string; body: string }) {
  const blocks: ReactNode[] = [];
  const lines = body.split("\n");
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`}>
        {items.map((item, i) => <li key={i}>{inline(item, `li-${blocks.length}-${i}`)}</li>)}
      </ul>,
    );
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) { bullets.push(line.slice(2)); continue; }
    flush();
    if (!line.trim()) continue;
    if (line === "---") { blocks.push(<hr key={`hr-${blocks.length}`} />); continue; }
    if (line.startsWith("### ")) { blocks.push(<h3 key={`h3-${blocks.length}`}>{inline(line.slice(4), `h3-${blocks.length}`)}</h3>); continue; }
    if (line.startsWith("## ")) { blocks.push(<h2 key={`h2-${blocks.length}`}>{inline(line.slice(3), `h2-${blocks.length}`)}</h2>); continue; }
    if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
      blocks.push(<p key={`em-${blocks.length}`} className={styles.note}><em>{line.slice(1, -1)}</em></p>);
      continue;
    }
    blocks.push(<p key={`p-${blocks.length}`}>{inline(line, `p-${blocks.length}`)}</p>);
  }
  flush();
  return <div className={`bn-app bn-secondary-page ${styles.page}`}>
    <main className={styles.shell}>
      <h1>{title}</h1>
      {updated ? <p className={styles.updated}>Last updated {updated}</p> : null}
      <div className={styles.body}>{blocks}</div>
    </main>
  </div>;
}
