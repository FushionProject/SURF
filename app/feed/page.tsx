import SurfEditorial from "@/components/surf-editorial/SurfEditorial";
import Link from "next/link";
import { Brand } from "@/components/surf-editorial/SurfEditorial";
import { paidFeatureDenial } from "@/lib/billing/access";

export default async function Page() {
  const denial = await paidFeatureDenial("signals");
  if (denial) return <main className="bn-app" style={{ minHeight: "100vh", padding: "48px 24px" }}>
    <Brand />
    <section style={{ maxWidth: 640, margin: "64px auto", border: "1px solid #00cde5", padding: 32 }}>
      <h1>Surf Signals</h1>
      <p style={{ margin: "20px 0", lineHeight: 1.7 }}>{denial.status === 503 ? "Paid access is temporarily unavailable. Please try again shortly." : "Sign in and choose a Signals plan to see the full feed of market opportunities and large trades."}</p>
      <Link href="/account">Your account & plans →</Link>
      <p style={{ marginTop: 20 }}><Link href="/games">Explore the free market board</Link></p>
    </section>
  </main>;
  return <SurfEditorial view="signals" />;
}
