import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/ui/Reveal";
import landing from "../landing.module.css";
import css from "./Teachers.module.css";

const PORTRAIT = "/landing/teachers/mykhailo-maksymov.webp";

export async function Teachers() {
  const t = await getTranslations("WelcomeLanding.teachers");
  const cardT = await getTranslations("TeacherPublicCard");
  const subjects = t("demo.subjects")
    .split(" · ")
    .map((subject) => subject.trim())
    .filter(Boolean);

  return (
    <section id="teachers" className={css.root} aria-labelledby="teachers-title">
      <div className={landing.container}>
        <Reveal as="article" className={css.stage}>
          <div className={css.intro}>
            <p className={css.kicker}>{t("kicker")}</p>
            <h2 id="teachers-title" className={css.title}>
              {t("demo.name")}
            </h2>
            <p className={css.lead}>{t("lead")}</p>
          </div>

          <figure className={css.portrait}>
            <Image
              className={css.photo}
              src={PORTRAIT}
              alt={t("imageAlt")}
              fill
              sizes="(min-width: 1240px) 22rem, (min-width: 768px) 22rem, 100vw"
            />
          </figure>

          <div className={css.facts}>
            <ul className={css.factList}>
              <li>{t("demo.city")}</li>
            </ul>
            {subjects.length > 0 ? (
              <ul className={css.chips}>
                {subjects.map((subject) => (
                  <li key={subject}>{subject}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className={css.story}>
            <p className={css.bio}>{t("demo.bio")}</p>
            <div className={css.publications}>
              <p className={css.publicationsLabel}>{cardT("publications")}</p>
              <p className={css.publicationsText}>{t("demo.publications")}</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
