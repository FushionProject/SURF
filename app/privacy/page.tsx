import type { Metadata } from "next";
import { LegalDocument } from "@/components/surf/LegalDocument";
import { LEGAL_UPDATED } from "@/lib/legal/shared";
import { PRIVACY_BODY } from "@/lib/legal/privacy";

export const metadata: Metadata = { title: "Privacy Policy · Surf" };

export default function Page() {
  return <LegalDocument
      title="Privacy Policy"
      updated={LEGAL_UPDATED}
      body={PRIVACY_BODY}
    />;
}
