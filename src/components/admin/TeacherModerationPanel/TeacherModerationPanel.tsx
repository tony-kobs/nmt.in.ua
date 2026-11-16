import { TeacherPublicCard } from "@/components/teachers/TeacherPublicCard";
import { TeacherModerationActions } from "./TeacherModerationActions";
import type { PublicTeacherCard } from "@/modules/teachers";
import type { TeacherModerationApplication } from "@/modules/teacher-moderation/types";
import css from "./TeacherModerationPanel.module.css";

type TeacherModerationPanelProps = {
  applications: TeacherModerationApplication[];
};

function toPublicTeacherCard(
  application: TeacherModerationApplication,
): PublicTeacherCard {
  return {
    userId: application.userId,
    slug: application.slug,
    headline: application.headline,
    bio: application.bio,
    experience: application.experience,
    publications: application.publications,
    city: application.city,
    country: application.country,
    subjects: application.subjects,
    teachingLevels: application.teachingLevels,
    teachingLanguages: application.teachingLanguages,
    lessonPrice: application.lessonPrice,
    lessonCurrency: application.lessonCurrency,
    lessonDurationMinutes: application.lessonDurationMinutes,
    contactUrl: application.contactUrl,
    externalUrl: "",
    photoUrl: "",
    about: "",
    approach: "",
    program: "",
    reviews: [],
    isPublic: false,
    displayName: application.displayName,
    login: application.slug,
    role: "teacher",
    avatarRev: application.avatarRev,
  };
}

export function TeacherModerationPanel({
  applications,
}: TeacherModerationPanelProps) {
  return (
    <section className={css.panel}>
      <div className={css.panelHeader}>
        <h2 className={css.panelTitle}>Заявки викладачів</h2>
        <p className={css.panelLead}>
          Перевірка заявок викладачів перед публікацією візитки.
        </p>
      </div>

      {applications.length === 0 ? (
        <p>Нових заявок на модерацію немає.</p>
      ) : (
        applications.map((application) => (
          <article key={application.userId} className={css.application}>
            <TeacherPublicCard
              card={toPublicTeacherCard(application)}
              showCta={false}
            />

            <div className={css.adminDetails}>
              <h3 className={css.adminDetailsTitle}>Дані заявки</h3>

              <dl className={css.detailsList}>
                <div className={css.detail}>
                  <dt>Email</dt>
                  <dd>{application.email || "Не вказано"}</dd>
                </div>

                <div className={css.detail}>
                  <dt>Телефон</dt>
                  <dd>{application.phone || "Не вказано"}</dd>
                </div>

                <div className={css.detail}>
                  <dt>Дата подання</dt>
                  <dd>{application.submittedAt || "Не вказано"}</dd>
                </div>

                <div className={css.motivation}>
                  <dt>Чому хоче долучитися до NMT?</dt>
                  <dd>{application.joinMotivation || "Не вказано"}</dd>
                </div>
              </dl>
            </div>
            <TeacherModerationActions teacherUserId={application.userId} />
          </article>
        ))
      )}
    </section>
  );
}
