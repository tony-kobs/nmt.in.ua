import {
  NavStubPage,
  createStubPageMetadata,
} from "@/components/dashboard/StubPage";

export async function generateMetadata() {
  return createStubPageMetadata("/consultations", "consultations");
}

export default function ConsultationsPage() {
  return <NavStubPage href="/consultations" />;
}
