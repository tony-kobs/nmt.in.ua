-- Workbook / задачник bank. Separate from quiz_tasks so printable tests
-- never leak into topic-test / Ultimate / diagnostic / simulator RAND().

CREATE TABLE IF NOT EXISTS problems (
  id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  problem_text TEXT NOT NULL,
  theme_id INT NOT NULL,
  answer_1 VARCHAR(255) NOT NULL,
  answer_2 VARCHAR(255) NOT NULL,
  answer_3 VARCHAR(255) NOT NULL,
  answer_4 VARCHAR(255) NOT NULL,
  right_answer_n TINYINT NOT NULL,
  comments TEXT NOT NULL,
  difficulty TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_problems_theme (theme_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
