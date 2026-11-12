import styles from "./InternCard.module.css";

type InternCardProps = {
  name: string;
  taskDescription: string;
  codeLabel: string;
  liveLabel: string;
  codeUrl: string;
  liveUrl: string;
};

export default function InternCard({
  name,
  taskDescription,
  codeLabel,
  liveLabel,
  codeUrl,
  liveUrl,
}: InternCardProps) {
  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div className={styles.avatar} aria-hidden="true">
          🎓
        </div>

        <h1 className={styles.name}>{name}</h1>
      </header>

      <div className={styles.content}>
        <p className={styles.description}>{taskDescription}</p>

        <div className={styles.links}>
          <a
            href={codeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.codeLink}
          >
            {codeLabel}
          </a>

          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.liveLink}
          >
            {liveLabel}
          </a>
        </div>
      </div>
    </article>
  );
}
