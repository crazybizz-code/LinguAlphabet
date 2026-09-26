/**
 * Database-authorization regression tests for pentest findings V-01..V-03.
 *
 * Runs entirely offline against an in-process Postgres built from the repo's
 * own schema files (see ./harness.ts) — it never touches the Supabase
 * project, so throwaway users here are just rows in a throwaway database.
 *
 * Every attack is asserted twice: against the pre-remediation schema, where
 * it must SUCCEED (proving the test genuinely reproduces the finding rather
 * than passing vacuously), and against the remediated schema, where it must
 * be DENIED. Legitimate learner and server paths are asserted to keep
 * working.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, REMEDIATION_MIGRATION, REMEDIATION_ROLLBACK, type Harness } from "./harness";

const LEARNER = "11111111-1111-4111-8111-111111111111";
const OTHER_LEARNER = "22222222-2222-4222-8222-222222222222";
const CONTENT_ID = "podcast-security-fixture";

const DENIED = /permission denied|row-level security/i;

async function seed(h: Harness): Promise<{ questionId: string }> {
  await h.createUser(LEARNER, "learner@example.test");
  await h.createUser(OTHER_LEARNER, "other@example.test");
  await h.admin(
    `insert into content_items (id, content_type, title, cefr_level_min, cefr_level_max, estimated_time_minutes)
     values ($1, 'podcast', 'Fixture', 'B1', 'B2', 10)`,
    [CONTENT_ID],
  );
  const [question] = await h.admin<{ id: string }>(
    `select id from assessment_questions where approved and not deprecated order by created_at, id limit 1`,
  );
  return { questionId: question.id };
}

async function createAttemptAsServer(h: Harness, userId: string): Promise<string> {
  const [row] = await h.as<{ id: string }>(
    "service_role",
    null,
    `insert into placement_attempts (user_id, status) values ($1, 'in_progress') returning id`,
    [userId],
  );
  return row.id;
}

const PLACEMENT_RESULT = {
  overall_cefr_level: "B2",
  reading_cefr_level: "B2",
  listening_cefr_level: "B1",
  estimated_band: 6.5,
  confidence_score: 0.72,
  weak_areas: ["listening_detail"],
  raw_scores: { reading: { correct: 6, total: 8 }, listening: { correct: 3, total: 6 } },
  adaptive_path: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Baseline: the findings reproduce on the pre-remediation schema.
// ─────────────────────────────────────────────────────────────────────────────

describe("pre-remediation schema reproduces the pentest findings", () => {
  let h: Harness;
  let questionId: string;

  beforeAll(async () => {
    h = await createHarness({ withRemediation: false });
    ({ questionId } = await seed(h));
  }, 60_000);

  it("V-01: a learner can read correct_answer / explanation", async () => {
    const rows = await h.as("authenticated", LEARNER, `select correct_answer, explanation from assessment_questions where id = $1`, [questionId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].correct_answer).toBeTruthy();
  });

  it("V-02: a learner can insert a completed C2 / band 9.0 placement", async () => {
    const rows = await h.as(
      "authenticated",
      LEARNER,
      `insert into placement_attempts (user_id, status, overall_cefr_level, estimated_band, completed_at)
       values ($1, 'completed', 'C2', 9.0, now()) returning id`,
      [LEARNER],
    );
    expect(rows).toHaveLength(1);
  });

  it("V-03: a learner can set their own xp and assessed_band", async () => {
    const rows = await h.as("authenticated", LEARNER, `update profiles set xp = 999999, assessed_band = 9 where user_id = $1 returning xp`, [LEARNER]);
    expect(rows).toEqual([{ xp: 999999 }]);
  });

  it("V-03: a learner can self-award an achievement", async () => {
    const rows = await h.as("authenticated", LEARNER, `insert into achievements (user_id, achievement_id) values ($1, 'forged') returning id`, [LEARNER]);
    expect(rows).toHaveLength(1);
  });

  it("leaderboard exposes other learners to anonymous callers", async () => {
    const rows = await h.as("anon", null, `select username, xp from leaderboard`);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Remediated schema.
// ─────────────────────────────────────────────────────────────────────────────

describe("remediated schema", () => {
  let h: Harness;
  let questionId: string;

  beforeAll(async () => {
    h = await createHarness({ withRemediation: true });
    ({ questionId } = await seed(h));
  }, 60_000);

  describe("V-01 answer-key exposure", () => {
    it.each(["correct_answer", "accepted_answers", "explanation", "passage"])(
      "authenticated learner cannot select assessment_questions.%s",
      async (column) => {
        await expect(h.as("authenticated", LEARNER, `select ${column} from assessment_questions where id = $1`, [questionId])).rejects.toThrow(DENIED);
      },
    );

    it("authenticated learner cannot bulk-read the question bank even without answer columns", async () => {
      // Question delivery is server-side only (placement/practice/mock
      // engines); the browser never needed direct table access.
      await expect(h.as("authenticated", LEARNER, `select id, question, options from assessment_questions`)).rejects.toThrow(DENIED);
    });

    it("anonymous caller cannot select answer fields", async () => {
      await expect(h.as("anon", null, `select correct_answer, accepted_answers, explanation from assessment_questions`)).rejects.toThrow(DENIED);
    });

    it("learner cannot read listening transcripts", async () => {
      await expect(h.as("authenticated", LEARNER, `select transcript from mock_listening_sections`)).rejects.toThrow(DENIED);
    });

    it("server-side grader (service_role) can read grading data", async () => {
      const rows = await h.as("service_role", null, `select correct_answer, accepted_answers, explanation from assessment_questions where id = $1`, [questionId]);
      expect(rows).toHaveLength(1);
      expect(rows[0].correct_answer).toBeTruthy();
    });
  });

  describe("V-02 forged placement results", () => {
    it("learner cannot INSERT a completed C2 / band 9.0 attempt", async () => {
      await expect(
        h.as(
          "authenticated",
          LEARNER,
          `insert into placement_attempts (user_id, status, overall_cefr_level, estimated_band, raw_scores, completed_at)
           values ($1, 'completed', 'C2', 9.0, '{"reading":{"correct":99,"total":99}}', now())`,
          [LEARNER],
        ),
      ).rejects.toThrow(DENIED);
    });

    it("learner cannot INSERT even a draft attempt (the server creates attempts)", async () => {
      await expect(h.as("authenticated", LEARNER, `insert into placement_attempts (user_id) values ($1)`, [LEARNER])).rejects.toThrow(DENIED);
    });

    it("learner cannot PATCH an existing attempt to band 9.0 / completed", async () => {
      const attemptId = await createAttemptAsServer(h, LEARNER);
      await expect(
        h.as("authenticated", LEARNER, `update placement_attempts set estimated_band = 9.0, status = 'completed' where id = $1`, [attemptId]),
      ).rejects.toThrow(DENIED);
      await expect(
        h.as("authenticated", LEARNER, `update placement_attempts set pending_question_id = $2 where id = $1`, [attemptId, questionId]),
      ).rejects.toThrow(DENIED);
    });

    it("learner cannot insert a forged is_correct placement response", async () => {
      const attemptId = await createAttemptAsServer(h, LEARNER);
      await expect(
        h.as(
          "authenticated",
          LEARNER,
          `insert into placement_responses (attempt_id, question_id, user_answer, is_correct, sequence_number) values ($1, $2, 'x', true, 1)`,
          [attemptId, questionId],
        ),
      ).rejects.toThrow(DENIED);
    });

    it("learner cannot call the trusted finalize function", async () => {
      const attemptId = await createAttemptAsServer(h, LEARNER);
      await expect(
        h.as("authenticated", LEARNER, `select finalize_placement_attempt($1, $2, $3::jsonb)`, [attemptId, LEARNER, JSON.stringify({ ...PLACEMENT_RESULT, estimated_band: 9 })]),
      ).rejects.toThrow(DENIED);
      await expect(
        h.as("anon", null, `select finalize_placement_attempt($1, $2, $3::jsonb)`, [attemptId, LEARNER, JSON.stringify(PLACEMENT_RESULT)]),
      ).rejects.toThrow(DENIED);
    });

    it("trusted server grading writes the result and profile atomically, exactly once", async () => {
      const attemptId = await createAttemptAsServer(h, LEARNER);
      const [first] = await h.as<{ ok: boolean }>("service_role", null, `select finalize_placement_attempt($1, $2, $3::jsonb) as ok`, [attemptId, LEARNER, JSON.stringify(PLACEMENT_RESULT)]);
      expect(first.ok).toBe(true);

      const [attempt] = await h.as("authenticated", LEARNER, `select status, overall_cefr_level, estimated_band::float8 as band, weak_areas, completed_at from placement_attempts where id = $1`, [attemptId]);
      expect(attempt).toMatchObject({ status: "completed", overall_cefr_level: "B2", band: 6.5, weak_areas: ["listening_detail"] });
      expect(attempt.completed_at).toBeTruthy();

      const [profile] = await h.as("authenticated", LEARNER, `select placement_completed, assessed_cefr_level, assessed_band::float8 as band from profiles where user_id = $1`, [LEARNER]);
      expect(profile).toEqual({ placement_completed: true, assessed_cefr_level: "B2", band: 6.5 });

      // Write-once: a second finalisation (e.g. a replayed /complete) is a no-op.
      const [second] = await h.as<{ ok: boolean }>("service_role", null, `select finalize_placement_attempt($1, $2, $3::jsonb) as ok`, [attemptId, LEARNER, JSON.stringify({ ...PLACEMENT_RESULT, estimated_band: 9 })]);
      expect(second.ok).toBe(false);
      const [after] = await h.as("service_role", null, `select estimated_band::float8 as band from placement_attempts where id = $1`, [attemptId]);
      expect(after.band).toBe(6.5);
    });

    it("finalize refuses an attempt that belongs to a different user", async () => {
      const attemptId = await createAttemptAsServer(h, OTHER_LEARNER);
      const [row] = await h.as<{ ok: boolean }>("service_role", null, `select finalize_placement_attempt($1, $2, $3::jsonb) as ok`, [attemptId, LEARNER, JSON.stringify(PLACEMENT_RESULT)]);
      expect(row.ok).toBe(false);
    });

    it("learner still reads their own attempts, never another learner's", async () => {
      const mine = await createAttemptAsServer(h, LEARNER);
      const theirs = await createAttemptAsServer(h, OTHER_LEARNER);
      expect(await h.as("authenticated", LEARNER, `select id from placement_attempts where id = $1`, [mine])).toHaveLength(1);
      expect(await h.as("authenticated", LEARNER, `select id from placement_attempts where id = $1`, [theirs])).toHaveLength(0);
    });

    it("learner cannot forge a submitted full mock attempt or its grades", async () => {
      await expect(
        h.as("authenticated", LEARNER, `insert into full_mock_attempts (user_id, status, estimated_band) values ($1, 'submitted', 9.0)`, [LEARNER]),
      ).rejects.toThrow(DENIED);

      const [attempt] = await h.as<{ id: string }>("service_role", null, `insert into full_mock_attempts (user_id, target_cefr_level) values ($1, 'B1') returning id`, [LEARNER]);
      await expect(h.as("authenticated", LEARNER, `update full_mock_attempts set estimated_band = 9.0 where id = $1`, [attempt.id])).rejects.toThrow(DENIED);
      await expect(
        h.as("authenticated", LEARNER, `insert into full_mock_responses (attempt_id, question_id, section, sequence_number, is_correct) values ($1, $2, 'reading', 1, true)`, [attempt.id, questionId]),
      ).rejects.toThrow(DENIED);
      await expect(h.as("authenticated", LEARNER, `update full_mock_responses set is_correct = true where attempt_id = $1`, [attempt.id])).rejects.toThrow(DENIED);
      // Reading own attempt (result page) still works.
      expect(await h.as("authenticated", LEARNER, `select id from full_mock_attempts where id = $1`, [attempt.id])).toHaveLength(1);
    });
  });

  describe("V-03 progression integrity", () => {
    it.each([
      ["xp", "999999"],
      ["level", "99"],
      ["xp_to_next", "1"],
      ["streak", "365"],
      ["longest_streak", "365"],
      ["streak_shields", "99"],
      ["total_minutes", "99999"],
      ["last_study_date", "current_date"],
      ["assessed_band", "9"],
      ["assessed_cefr_level", "'C2'"],
      ["assessed_reading_level", "'C2'"],
      ["assessed_listening_level", "'C2'"],
      ["assessment_confidence", "1"],
      ["weak_areas", "'{}'"],
      ["placement_completed", "true"],
    ])("learner cannot PATCH profiles.%s", async (column, value) => {
      await expect(h.as("authenticated", LEARNER, `update profiles set ${column} = ${value} where user_id = $1`, [LEARNER])).rejects.toThrow(DENIED);
    });

    it("a mixed patch (safe column + xp) is rejected as a whole", async () => {
      await expect(h.as("authenticated", LEARNER, `update profiles set username = 'x', xp = 999999 where user_id = $1`, [LEARNER])).rejects.toThrow(DENIED);
    });

    it("learner can still update self-reported onboarding / profile fields", async () => {
      // Exactly the column set the onboarding wizard, /ai-plan and
      // updateLearningProfile write with the learner's own token.
      const rows = await h.as(
        "authenticated",
        LEARNER,
        `update profiles set username = 'Sam', english_level = 'B1', goal = 'Exam Preparation', daily_time_minutes = 30,
           exam_type = 'academic', current_band = 6.0, target_band = 7.5, exam_timeline = '3_months', exam_date = null,
           interests = '{Travel}', onboarding_completed = true, avatar_url = null, tuto_name = 'Tuto'
         where user_id = $1 returning username, current_band::float8 as band`,
        [LEARNER],
      );
      expect(rows).toEqual([{ username: "Sam", band: 6 }]);
    });

    it("learner cannot touch another learner's profile", async () => {
      const rows = await h.as("authenticated", LEARNER, `update profiles set username = 'pwned' where user_id = $1 returning id`, [OTHER_LEARNER]);
      expect(rows).toHaveLength(0);
      expect(await h.as("authenticated", LEARNER, `select user_id from profiles where user_id = $1`, [OTHER_LEARNER])).toHaveLength(0);
    });

    it("learner cannot self-award an achievement", async () => {
      await expect(h.as("authenticated", LEARNER, `insert into achievements (user_id, achievement_id) values ($1, 'forged')`, [LEARNER])).rejects.toThrow(DENIED);
    });

    it("learner cannot forge progress xp / quiz score", async () => {
      await expect(
        h.as("authenticated", LEARNER, `insert into progress (user_id, content_item_id, completed, xp_earned, quiz_score, quiz_total) values ($1, $2, true, 99999, 10, 10)`, [LEARNER, CONTENT_ID]),
      ).rejects.toThrow(DENIED);
    });

    it("learner cannot forge a practice score", async () => {
      await expect(
        h.as("authenticated", LEARNER, `insert into practice_sessions (user_id, practice_type, target_cefr_level, status, correct_count, score_pct) values ($1, 'reading', 'B1', 'completed', 10, 100)`, [LEARNER]),
      ).rejects.toThrow(DENIED);

      const [session] = await h.as<{ id: string }>("service_role", null, `insert into practice_sessions (user_id, practice_type, target_cefr_level) values ($1, 'reading', 'B1') returning id`, [LEARNER]);
      await expect(h.as("authenticated", LEARNER, `update practice_sessions set score_pct = 100, correct_count = 10 where id = $1`, [session.id])).rejects.toThrow(DENIED);
      await expect(
        h.as("authenticated", LEARNER, `insert into practice_responses (session_id, question_id, user_answer, is_correct, sequence_number) values ($1, $2, 'x', true, 1)`, [session.id, questionId]),
      ).rejects.toThrow(DENIED);
    });

    it("learner cannot create a daily mission (which would upgrade XP and streak)", async () => {
      await expect(
        h.as("authenticated", LEARNER, `insert into daily_missions (user_id, mission_date, content_item_id, content_type) values ($1, current_date, $2, 'podcast')`, [LEARNER, CONTENT_ID]),
      ).rejects.toThrow(DENIED);
    });

    it("learner cannot forge authoritative learning signals", async () => {
      await expect(
        h.as("authenticated", LEARNER, `insert into learning_signals (user_id, type, source, evidence) values ($1, 'mock_completed', 'content_session', '{"estimatedBand":9}')`, [LEARNER]),
      ).rejects.toThrow(DENIED);
      await expect(
        h.as("authenticated", LEARNER, `insert into learning_signals (user_id, type, source) values ($1, 'article_completed', 'mock_engine')`, [LEARNER]),
      ).rejects.toThrow(DENIED);
    });

    it("learner can still record their own ordinary learning signals", async () => {
      const rows = await h.as("authenticated", LEARNER, `insert into learning_signals (user_id, type, source) values ($1, 'podcast_completed', 'content_session') returning id`, [LEARNER]);
      expect(rows).toHaveLength(1);
      await expect(
        h.as("authenticated", LEARNER, `insert into learning_signals (user_id, type, source) values ($1, 'podcast_completed', 'content_session')`, [OTHER_LEARNER]),
      ).rejects.toThrow(DENIED);
    });

    it("trusted server path can award XP, progress and achievements", async () => {
      await h.as("service_role", null, `update profiles set xp = xp + 70, streak = 1, streak_shields = 1 where user_id = $1`, [LEARNER]);
      await h.as(
        "service_role",
        null,
        `insert into progress (user_id, content_item_id, completed, xp_earned) values ($1, $2, true, 70)
         on conflict (user_id, content_item_id) do update set xp_earned = excluded.xp_earned`,
        [LEARNER, CONTENT_ID],
      );
      await h.as("service_role", null, `insert into achievements (user_id, achievement_id) values ($1, 'first_session')`, [LEARNER]);

      const [profile] = await h.as("authenticated", LEARNER, `select xp, streak from profiles where user_id = $1`, [LEARNER]);
      expect(profile).toEqual({ xp: 70, streak: 1 });
      expect(await h.as("authenticated", LEARNER, `select xp_earned from progress where user_id = $1`, [LEARNER])).toEqual([{ xp_earned: 70 }]);
      expect(await h.as("authenticated", LEARNER, `select achievement_id from achievements where user_id = $1`, [LEARNER])).toEqual([{ achievement_id: "first_session" }]);
    });

    it("leaderboard no longer exposes learners", async () => {
      await expect(h.as("anon", null, `select username, xp from leaderboard`)).rejects.toThrow(DENIED);
      await expect(h.as("authenticated", LEARNER, `select username, xp from leaderboard`)).rejects.toThrow(DENIED);
    });

    it("signup trigger still creates a profile for a new user", async () => {
      const newUser = "33333333-3333-4333-8333-333333333333";
      await h.createUser(newUser, "new@example.test");
      const rows = await h.as("authenticated", newUser, `select username, xp, placement_completed from profiles where user_id = $1`, [newUser]);
      expect(rows).toEqual([{ username: "new", xp: 0, placement_completed: false }]);
    });
  });

  describe("exact learner privilege surface", () => {
    it("learner cannot INSERT a profile (profiles come only from the signup trigger)", async () => {
      await expect(
        h.as("authenticated", LEARNER, `insert into profiles (user_id, username, xp) values ($1, 'dup', 999999)`, [LEARNER]),
      ).rejects.toThrow(DENIED);
      await expect(h.as("authenticated", LEARNER, `insert into profiles (user_id, username) values ($1, 'dup')`, [LEARNER])).rejects.toThrow(DENIED);
    });

    it("learner cannot touch profiles.updated_at or identity columns", async () => {
      for (const assignment of ["updated_at = now()", "user_id = user_id", "id = id", "created_at = now()"]) {
        await expect(h.as("authenticated", LEARNER, `update profiles set ${assignment} where user_id = $1`, [LEARNER])).rejects.toThrow(DENIED);
      }
    });

    it("grants UPDATE on exactly the self-reported/preference columns", async () => {
      const rows = await h.admin<{ column_name: string }>(
        `select column_name from information_schema.column_privileges
          where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE'
          order by column_name`,
      );
      expect(rows.map((r) => r.column_name)).toEqual([
        "avatar_url", "current_band", "daily_time_minutes", "english_level", "exam_date", "exam_timeline",
        "exam_type", "goal", "interests", "onboarding_completed", "target_band", "tuto_name", "username",
      ]);
    });

    it.each([
      "profiles", "progress", "achievements", "daily_missions", "plan_tasks", "placement_attempts", "placement_responses",
      "practice_sessions", "practice_responses", "full_mock_attempts", "full_mock_responses", "question_exposure", "learning_signals",
    ])("learner keeps SELECT on own %s rows", async (table) => {
      await expect(h.as("authenticated", LEARNER, `select 1 from ${table} limit 1`)).resolves.toBeDefined();
    });
  });

  describe("migration lifecycle", () => {
    it("is idempotent", async () => {
      await h.applyFile(REMEDIATION_MIGRATION);
      await expect(h.as("authenticated", LEARNER, `select correct_answer from assessment_questions`)).rejects.toThrow(DENIED);
      await expect(h.as("authenticated", LEARNER, `update profiles set xp = 1 where user_id = $1`, [LEARNER])).rejects.toThrow(DENIED);
    });

    it("rolls back to the pre-remediation behaviour and can be re-applied", async () => {
      await h.applyFile(REMEDIATION_ROLLBACK);
      expect(await h.as("authenticated", LEARNER, `select correct_answer from assessment_questions where id = $1`, [questionId])).toHaveLength(1);
      expect(await h.as("authenticated", LEARNER, `update profiles set xp = 5 where user_id = $1 returning xp`, [LEARNER])).toEqual([{ xp: 5 }]);

      await h.applyFile(REMEDIATION_MIGRATION);
      await expect(h.as("authenticated", LEARNER, `select correct_answer from assessment_questions`)).rejects.toThrow(DENIED);
      await expect(h.as("authenticated", LEARNER, `update profiles set xp = 1 where user_id = $1`, [LEARNER])).rejects.toThrow(DENIED);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Live-state reconciliation: production's policies/grants differ from the
// repo files (verified from the live audit export, 2026-09). Recreate the
// riskiest shapes of that drift, then prove the migration still closes
// every finding on top of it.
// ─────────────────────────────────────────────────────────────────────────────

const LIVE_DRIFT_SQL = `
  -- Explicit column-level SELECT on answer fields (live export shows these).
  grant select (correct_answer, accepted_answers, explanation) on table public.assessment_questions to authenticated;
  -- Privileges held by the PUBLIC pseudo-role are inherited by every role.
  grant select on table public.assessment_questions, public.mock_listening_sections, public.leaderboard to public;
  grant all on table public.profiles, public.progress, public.achievements, public.daily_missions,
    public.learning_signals, public.plan_tasks, public.placement_attempts, public.placement_responses,
    public.practice_sessions to public;
  -- Explicit column-level UPDATE on progression fields.
  grant update (xp, level, streak, assessed_band, placement_completed) on table public.profiles to authenticated;
  -- Permissive policies under names the migration does not know about.
  create policy "drift: learners edit own profile" on public.profiles for update to public using (auth.uid() = user_id);
  create policy "drift: learners manage own achievements" on public.achievements for all to public using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "drift: learners insert own attempts" on public.placement_attempts for insert to public with check (user_id = auth.uid());
  create policy "drift: learners read questions" on public.assessment_questions for select to public using (true);
`;

describe("migration applied on top of live-production drift", () => {
  let h: Harness;
  let questionId: string;

  beforeAll(async () => {
    h = await createHarness({ withRemediation: false });
    ({ questionId } = await seed(h));
    await h.db.exec(LIVE_DRIFT_SQL);

    // Sanity: the drift really is exploitable before the migration.
    expect(await h.as("authenticated", LEARNER, `select correct_answer from assessment_questions where id = $1`, [questionId])).toHaveLength(1);
    expect(await h.as("authenticated", LEARNER, `update profiles set xp = 7 where user_id = $1 returning xp`, [LEARNER])).toEqual([{ xp: 7 }]);

    await h.applyFile(REMEDIATION_MIGRATION);
  }, 60_000);

  it("V-01: column grants and PUBLIC grants no longer expose answer keys", async () => {
    await expect(h.as("authenticated", LEARNER, `select correct_answer from assessment_questions`)).rejects.toThrow(DENIED);
    await expect(h.as("authenticated", LEARNER, `select accepted_answers, explanation from assessment_questions`)).rejects.toThrow(DENIED);
    await expect(h.as("anon", null, `select correct_answer from assessment_questions`)).rejects.toThrow(DENIED);
    await expect(h.as("authenticated", LEARNER, `select transcript from mock_listening_sections`)).rejects.toThrow(DENIED);
    await expect(h.as("anon", null, `select username from leaderboard`)).rejects.toThrow(DENIED);
  });

  it("V-02: unknown insert policies no longer allow forged attempts or responses", async () => {
    await expect(
      h.as("authenticated", LEARNER, `insert into placement_attempts (user_id, status, estimated_band) values ($1, 'completed', 9.0)`, [LEARNER]),
    ).rejects.toThrow(DENIED);
    const attemptId = await createAttemptAsServer(h, LEARNER);
    await expect(
      h.as("authenticated", LEARNER, `insert into placement_responses (attempt_id, question_id, user_answer, is_correct, sequence_number) values ($1, $2, 'x', true, 1)`, [attemptId, questionId]),
    ).rejects.toThrow(DENIED);
  });

  it.each(["xp = 999999", "level = 99", "streak = 365", "assessed_band = 9", "placement_completed = true"])(
    "V-03: explicit column grant + PUBLIC grant + drift policy cannot set profiles.%s",
    async (assignment) => {
      await expect(h.as("authenticated", LEARNER, `update profiles set ${assignment} where user_id = $1`, [LEARNER])).rejects.toThrow(DENIED);
    },
  );

  it("V-03: progression tables are write-protected despite PUBLIC grants", async () => {
    await expect(h.as("authenticated", LEARNER, `insert into achievements (user_id, achievement_id) values ($1, 'forged')`, [LEARNER])).rejects.toThrow(DENIED);
    await expect(h.as("authenticated", LEARNER, `insert into progress (user_id, content_item_id, completed, xp_earned) values ($1, $2, true, 9999)`, [LEARNER, CONTENT_ID])).rejects.toThrow(DENIED);
    await expect(h.as("authenticated", LEARNER, `insert into daily_missions (user_id, mission_date, content_item_id, content_type) values ($1, current_date, $2, 'podcast')`, [LEARNER, CONTENT_ID])).rejects.toThrow(DENIED);
    await expect(h.as("authenticated", LEARNER, `update plan_tasks set completed = true`)).rejects.toThrow(DENIED);
    await expect(h.as("authenticated", LEARNER, `insert into practice_sessions (user_id, practice_type, target_cefr_level, score_pct) values ($1, 'reading', 'B1', 100)`, [LEARNER])).rejects.toThrow(DENIED);
    await expect(h.as("authenticated", LEARNER, `insert into learning_signals (user_id, type, source) values ($1, 'mock_completed', 'mock_engine')`, [LEARNER])).rejects.toThrow(DENIED);
  });

  it("legitimate learner paths still work on top of the drift", async () => {
    expect(await h.as("authenticated", LEARNER, `update profiles set target_band = 7.5, current_band = 6.0 where user_id = $1 returning target_band::float8 as t`, [LEARNER])).toEqual([{ t: 7.5 }]);
    expect(await h.as("authenticated", LEARNER, `select user_id from profiles where user_id = $1`, [LEARNER])).toHaveLength(1);
    expect(await h.as("authenticated", LEARNER, `insert into learning_signals (user_id, type, source) values ($1, 'article_completed', 'content_session') returning id`, [LEARNER])).toHaveLength(1);
    // Cross-user access stays denied through the drift policies too.
    expect(await h.as("authenticated", LEARNER, `select user_id from profiles where user_id = $1`, [OTHER_LEARNER])).toHaveLength(0);
    expect(await h.as("anon", null, `select user_id from profiles`)).toHaveLength(0);
  });
});
