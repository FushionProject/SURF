import type { Metadata } from "next";
import { LegalDocument } from "@/components/surf/LegalDocument";
import { LEGAL_UPDATED } from "@/lib/legal/shared";
import { TERMS_BODY } from "@/lib/legal/terms";

export const metadata: Metadata = { title: "Terms of Service · Surf" };

export default function Page() {
  return <LegalDocument
      title="Terms of Service"
      updated={LEGAL_UPDATED}
      body={TERMS_BODY}
    />;
}
