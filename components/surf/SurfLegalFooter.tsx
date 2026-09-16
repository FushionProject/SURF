import Link from "next/link";
import styles from "./legal-footer.module.css";

const LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/methodology", label: "Methodology & Support" },
  { href: "/how-to-use", label: "How to use Surf" },
];

export function SurfLegalFooter() {
  return <footer className={styles.footer}>
    <nav aria-label="Legal and support">
      {LINKS.map(link => <Link key={link.href} href={link.href} prefetch={false}>{link.label}</Link>)}
    </nav>
    <p>Surf shows sports market data and its own analysis. It does not accept wagers, hold funds, or tell you what to bet. Betting carries real risk of losing money.</p>
  </footer>;
}
