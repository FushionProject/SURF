import type { Metadata } from "next";
import { LegalDocument } from "@/components/surf/LegalDocument";
import { METHODOLOGY_BODY } from "@/lib/legal/methodology";

export const metadata: Metadata = { title: "Methodology and Support · Surf" };

export default function Page() {
  return <LegalDocument
      title="Methodology and Support"
      body={METHODOLOGY_BODY}
    />;
}
