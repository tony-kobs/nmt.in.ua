import { getTranslations } from "next-intl/server";
import InternCard from "./InternCard";

export default async function InternPage() {
  const t = await getTranslations("InternMyPage");

  return (
    <main
      style={{
        display: "flex",
        justifyContent: "center",
        width: "100%",
        minWidth: 0,
        padding: "40px 16px",
        boxSizing: "border-box",
      }}
    >
      <InternCard
        name={t("name")}
        taskDescription={t("task1")}
        codeLabel={t("codeLink")}
        liveLabel={t("liveLink")}
        codeUrl="https://github.com/sasha-dubrovina28/math-trainer"
        liveUrl="https://math-trainer-phi.vercel.app/"
      />
    </main>
  );
}
