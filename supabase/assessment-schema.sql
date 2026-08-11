-- Assessment engine schema: question bank, placement attempts, individual responses.
--
-- Design principles:
--   1. Question bank is append-only; questions are never deleted, only deprecated.
--   2. Placement responses are append-only (no UPDATE/DELETE RLS policy for learners).
--   3. placement_attempts is separate from placement_completed on profiles —
--      a learner can have multiple attempts; the most recent completed one wins.
--   4. The question bank only exposes approved=true rows to the engine.
--      Questions arrive as seed | generated; human review flips approved=true.

-- ──────────────────────────────────────────
-- Question bank
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assessment_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill         text NOT NULL CHECK (skill IN ('reading','listening','vocabulary','grammar')),
  type          text NOT NULL CHECK (type IN ('mc','tf','fill')),
  difficulty    text NOT NULL CHECK (difficulty IN ('A1','A2','B1','B2','C1','C2')),
  -- For reading: the passage text. For listening: the audio transcript (shown
  -- when audio_url is null — allows the system to function without audio files).
  passage       text,
  passage_title text,
  audio_url     text,
  question      text NOT NULL,
  -- JSON array of option strings for mc/tf; null for fill.
  options       jsonb,
  correct_answer text NOT NULL,
  explanation   text,
  tags          text[]  DEFAULT '{}',
  approved      boolean NOT NULL DEFAULT false,
  deprecated    boolean NOT NULL DEFAULT false,
  -- 'seed' | 'generated' | 'human'
  source        text NOT NULL DEFAULT 'seed',
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_questions_skill_difficulty
  ON assessment_questions (skill, difficulty)
  WHERE approved = true AND deprecated = false;

-- Row-Level Security: learners can read approved, non-deprecated questions only.
-- The service-role client bypasses RLS for the engine.
ALTER TABLE assessment_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved questions are readable by authenticated users"
  ON assessment_questions FOR SELECT
  TO authenticated
  USING (approved = true AND deprecated = false);

-- ──────────────────────────────────────────
-- Placement attempts
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS placement_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  status          text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','completed','abandoned')),

  -- Results — null until status = 'completed'
  overall_cefr_level     text CHECK (overall_cefr_level IN ('A1','A2','B1','B2','C1','C2')),
  reading_cefr_level     text CHECK (reading_cefr_level IN ('A1','A2','B1','B2','C1','C2')),
  listening_cefr_level   text CHECK (listening_cefr_level IN ('A1','A2','B1','B2','C1','C2')),
  estimated_band         numeric(3,1) CHECK (estimated_band >= 0 AND estimated_band <= 9),
  confidence_score       numeric(4,3) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  weak_areas             text[] DEFAULT '{}',
  -- {reading:{correct,total}, listening:{correct,total}}
  raw_scores             jsonb,
  -- ordered sequence of {questionId, difficulty, skill} for audit/analysis
  adaptive_path          jsonb,

  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS placement_attempts_user_id
  ON placement_attempts (user_id, created_at DESC);

ALTER TABLE placement_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own attempts"
  ON placement_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own attempts"
  ON placement_attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Updates are service-role only (scoring is done server-side).

-- ──────────────────────────────────────────
-- Placement responses
-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS placement_responses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id        uuid NOT NULL REFERENCES placement_attempts(id) ON DELETE CASCADE,
  question_id       uuid NOT NULL REFERENCES assessment_questions(id),
  user_answer       text NOT NULL,
  is_correct        boolean NOT NULL,
  time_taken_seconds int,
  sequence_number   int NOT NULL,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS placement_responses_attempt_id
  ON placement_responses (attempt_id, sequence_number);

ALTER TABLE placement_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read responses for their own attempts"
  ON placement_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM placement_attempts pa
      WHERE pa.id = attempt_id AND pa.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert responses for their own attempts"
  ON placement_responses FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM placement_attempts pa
      WHERE pa.id = attempt_id AND pa.user_id = auth.uid()
        AND pa.status = 'in_progress'
    )
  );

-- ──────────────────────────────────────────
-- Seed questions (approved, Reading + Listening)
-- ──────────────────────────────────────────
-- 14 seed questions: 10 Reading (A2×2, B1×2, B2×2, C1×2, C2×2) +
--                    4 Listening (A2×1, B1×1, B2×1, C1×1)
-- All are multiple-choice with 4 options.

INSERT INTO assessment_questions
  (skill, type, difficulty, passage, passage_title, question, options, correct_answer, explanation, source, approved)
VALUES

-- ── Reading A2 ──────────────────────────────────────────────────────────────

('reading','mc','A2',
 'LIBRARY NOTICE: The library will be closed on Saturday, 15th March for maintenance. It will reopen on Monday, 17th March at 9:00am. Members can return books using the drop box outside the main entrance. We apologize for any inconvenience.',
 'Library Notice',
 'Why will the library be closed on Saturday?',
 '["For a public holiday","For maintenance work","Due to staff training","Because of bad weather"]',
 'For maintenance work',
 'The notice states clearly that the closure is "for maintenance".',
 'seed', true),

('reading','mc','A2',
 'Hi Tom, I''m writing to confirm our meeting next Tuesday at 2pm. Please bring the report you mentioned in your last email. Let me know if this time still works for you. Best, Sarah',
 'Email from Sarah',
 'What does Sarah want Tom to bring to the meeting?',
 '["His laptop","A report","Some money","Identification"]',
 'A report',
 'Sarah explicitly asks Tom to "bring the report you mentioned in your last email".',
 'seed', true),

-- ── Reading B1 ──────────────────────────────────────────────────────────────

('reading','mc','B1',
 'Many cities around the world are introducing ''car-free days'' to reduce air pollution. On these days, private vehicles are banned from city centres, encouraging people to use public transport, cycle, or walk. Supporters argue that these initiatives significantly improve air quality and reduce noise levels. Critics, however, point out that car-free days can cause problems for people who need vehicles for work, such as delivery drivers and tradespeople.',
 'Car-Free Days',
 'According to the passage, what is one argument AGAINST car-free days?',
 '["They do not improve air quality","They make cities quieter","They cause difficulties for some workers","They reduce the use of public transport"]',
 'They cause difficulties for some workers',
 'The text states that critics point out problems for people who need vehicles for work, giving delivery drivers and tradespeople as examples.',
 'seed', true),

('reading','mc','B1',
 'The new manager''s approach was controversial from the start. Unlike her predecessor, who had always consulted staff before making decisions, she introduced sweeping changes without any discussion. By the end of the first month, morale in the office had dropped considerably.',
 'The New Manager',
 'What can be inferred about the previous manager?',
 '["He was less efficient than the new manager","He involved staff in decision-making","He made fewer changes to the office","He was popular with senior management"]',
 'He involved staff in decision-making',
 'The passage contrasts the new manager with her predecessor, who "had always consulted staff before making decisions" — i.e. he involved them in decision-making.',
 'seed', true),

-- ── Reading B2 ──────────────────────────────────────────────────────────────

('reading','mc','B2',
 'The widespread adoption of electric vehicles (EVs) is often presented as a straightforward solution to reducing carbon emissions from transport. However, the environmental benefits depend heavily on the source of the electricity used to charge them. In countries where electricity generation relies primarily on coal, EVs may produce more lifecycle emissions than their petrol counterparts. Furthermore, the production of lithium-ion batteries involves significant environmental costs, including mining operations that can damage local ecosystems. A comprehensive approach to sustainable transport must therefore consider the entire supply chain, not merely the absence of a tailpipe.',
 'Electric Vehicles and the Environment',
 'What is the author''s main argument about electric vehicles?',
 '["They are always better for the environment than petrol cars","Their environmental impact depends on factors beyond the vehicle itself","They should not be adopted until better battery technology exists","The cost of production makes them unsuitable for most consumers"]',
 'Their environmental impact depends on factors beyond the vehicle itself',
 'The passage argues that EVs'' environmental benefits "depend heavily" on electricity sources and battery production — factors beyond the vehicle itself. The author never argues EVs should not be adopted.',
 'seed', true),

('reading','mc','B2',
 'The government''s austerity measures, implemented in response to the economic crisis, proved deeply polarising. Proponents argued that fiscal restraint was essential to restore market confidence and avoid a sovereign debt crisis. Detractors, however, maintained that cutting public expenditure during a recession would exacerbate unemployment and depress demand, deepening rather than resolving the economic difficulties.',
 'Austerity Debate',
 'In this passage, what does the word "exacerbate" most nearly mean?',
 '["Reduce","Worsen","Stabilize","Explain"]',
 'Worsen',
 '"Exacerbate" means to make something worse. The context supports this: detractors believed cutting spending would make unemployment and economic difficulties worse.',
 'seed', true),

-- ── Reading C1 ──────────────────────────────────────────────────────────────

('reading','mc','C1',
 'The relationship between economic development and democratic governance is more nuanced than is often supposed. While modernisation theory posited a linear progression from poverty to prosperity to democracy, empirical evidence has repeatedly complicated this narrative. Several East Asian economies achieved rapid industrialisation and rising living standards under authoritarian regimes, while some nascent democracies have struggled to sustain economic growth. What the evidence does suggest, however, is that certain institutional prerequisites — particularly secure property rights and the rule of law — correlate strongly with both economic performance and eventual democratic consolidation.',
 'Development and Democracy',
 'Which claim is best supported by the evidence described in the passage?',
 '["Economic development always leads to democracy","Authoritarian regimes cannot achieve economic growth","Democratic institutions are incompatible with rapid industrialisation","Certain institutional features are associated with both economic and democratic development"]',
 'Certain institutional features are associated with both economic and democratic development',
 'The passage explicitly states that "certain institutional prerequisites … correlate strongly with both economic performance and eventual democratic consolidation". The other options are contradicted by the text.',
 'seed', true),

('reading','mc','C1',
 'The notion that artificial intelligence will soon render human creativity obsolete rests on a fundamental misunderstanding of what creativity entails. AI systems can generate plausible imitations of creative work by identifying patterns in vast datasets, but pattern recognition is categorically distinct from the kind of intentional, emotionally-grounded meaning-making that characterises genuine artistic expression. To conflate the two is to confuse fluency with understanding — a category error that says more about our impoverished conception of creativity than about the capacities of machines.',
 'AI and Human Creativity',
 'The author''s tone in this passage is best described as:',
 '["Enthusiastic and celebratory","Cautious and uncertain","Critical and assertive","Neutral and analytical"]',
 'Critical and assertive',
 'The author directly challenges a widely held view ("rests on a fundamental misunderstanding"), uses strong evaluative language ("category error", "impoverished conception"), and asserts a clear position — hallmarks of a critical and assertive tone.',
 'seed', true),

-- ── Reading C2 ──────────────────────────────────────────────────────────────

('reading','mc','C2',
 'The perennial debate over whether historical judgements should be rendered according to contemporary moral standards or those prevailing at the time founders, I would suggest, on a false dichotomy. To insist that we judge historical actors by the standards of their own era is not moral relativism but epistemic humility — an acknowledgement that individuals cannot be held accountable for failing to transcend the cognitive horizons of their culture. Yet this principle carries its own limit: it cannot excuse the wilful disregard of moral evidence that was available and legible to contemporaries. Slaveholders who profited from a system many of their peers condemned as cruel and unjust cannot retreat behind the defence of temporal distance.',
 'Judging History',
 'The author argues that judging historical actors by the standards of their era:',
 '["Is always the correct approach in historical analysis","Is appropriate except when contemporaries recognised the act as wrong","Should be entirely replaced by modern moral standards","Represents a form of moral relativism that must be rejected"]',
 'Is appropriate except when contemporaries recognised the act as wrong',
 'The author supports judging by era standards as "epistemic humility" but draws a firm limit: this principle "cannot excuse the wilful disregard of moral evidence that was available and legible to contemporaries" — as in the slavery example.',
 'seed', true),

('reading','mc','C2',
 'Economists have long debated whether minimum wage increases cause unemployment. The intuition behind the concern is straightforward: if labour becomes more expensive, employers will hire less of it. Yet field studies — most famously Card and Krueger''s 1994 comparison of fast-food employment across state lines — repeatedly fail to find the predicted negative employment effects. Various explanations have been proposed: employers may absorb higher wages by reducing profits rather than headcount, or monopsony power in low-wage labour markets may mean that the competitive model''s predictions simply do not apply. Whatever the mechanism, the empirical literature increasingly suggests that the relationship between minimum wages and employment is far more contingent than theory alone would predict.',
 'Minimum Wage and Employment',
 'Which of the following best describes what Card and Krueger''s study found?',
 '["Minimum wage increases always cause unemployment","Raising minimum wages had no significant negative effect on employment in their sample","Fast-food employers reduced profits rather than staff numbers","Monopsony power explains why the competitive model fails"]',
 'Raising minimum wages had no significant negative effect on employment in their sample',
 'Card and Krueger''s study "repeatedly fail[ed] to find the predicted negative employment effects" — i.e. they found no significant negative employment effect. Options C and D describe proposed explanations, not what the study itself found.',
 'seed', true),

-- ── Listening A2 ─────────────────────────────────────────────────────────────
-- audio_url is null in seed; the UI shows the transcript as a reading stand-in.

('listening','mc','A2',
 'Woman: Excuse me, could you tell me how to get to the station? Man: Of course. Go straight ahead and turn left at the traffic lights. The station is about five minutes'' walk from there. Woman: Thank you. Is there a bus I could take? Man: Yes, bus number 12 stops just outside, but it only runs every half hour. Woman: I''ll walk then, it''s quicker. Thank you!',
 'Directions to the Station',
 'Why does the woman decide to walk to the station?',
 '["The bus is too expensive","Walking is faster than waiting for the bus","The bus does not go to the station","The station is too close for a bus"]',
 'Walking is faster than waiting for the bus',
 'The woman says "I''ll walk then, it''s quicker" — the bus runs every half hour, making walking the faster option.',
 'seed', true),

-- ── Listening B1 ─────────────────────────────────────────────────────────────

('listening','mc','B1',
 'Good morning, everyone. Before we begin today''s meeting, I''d like to update you on the progress of the new office renovation. The first phase, covering the ground floor, is now complete and we''re very pleased with the results. The second phase, which will affect the second and third floors, begins on Monday. This means that staff on those floors will need to relocate temporarily to the conference rooms in Building B. Parking arrangements will remain unchanged. I know this is disruptive and I appreciate your patience.',
 'Office Renovation Announcement',
 'Where will staff from the second and third floors work during the renovation?',
 '["In a nearby hotel","From home","In conference rooms in Building B","On the ground floor"]',
 'In conference rooms in Building B',
 'The speaker explicitly states that affected staff "will need to relocate temporarily to the conference rooms in Building B".',
 'seed', true),

-- ── Listening B2 ─────────────────────────────────────────────────────────────

('listening','mc','B2',
 'Interviewer: Dr Patel, there''s a lot of discussion at the moment about the role of technology in education. Are we embracing it too quickly? Dr Patel: It''s a genuinely complex question. On one hand, digital tools can make learning more personalised and accessible — a student in a remote area can access the same quality content as someone at an elite institution. On the other hand, I''m concerned that we sometimes adopt technology because it''s fashionable rather than because there''s strong evidence it improves outcomes. We have some research suggesting that, for example, reading comprehension is often better when students read print rather than screens. So I''d say: adopt thoughtfully, evaluate rigorously, and don''t assume newer is better. Interviewer: So caution rather than resistance? Dr Patel: Precisely. The question isn''t whether to use technology but when and how.',
 'Interview: Technology in Education',
 'What is Dr Patel''s main concern about technology in education?',
 '["It makes education too expensive","It is sometimes adopted without sufficient evidence of benefit","It reduces the quality of content available to students","It is too difficult for teachers to use effectively"]',
 'It is sometimes adopted without sufficient evidence of benefit',
 'Dr Patel explicitly says "I''m concerned that we sometimes adopt technology because it''s fashionable rather than because there''s strong evidence it improves outcomes".',
 'seed', true),

-- ── Listening C1 ─────────────────────────────────────────────────────────────

('listening','mc','C1',
 'Today I want to examine what economists call the ''paradox of thrift'' — and why it remains one of the most counterintuitive ideas in macroeconomics. At the individual level, saving money is universally considered prudent. If a household increases its savings, it improves its financial security. This seems entirely rational. Yet what is rational for an individual household may be irrational for the economy as a whole. If all households simultaneously increase their savings — that is, reduce their spending — aggregate demand falls. Businesses see falling revenues, respond by cutting production and laying off workers, and household incomes decline as a result. The very attempt to save more collectively produces a situation in which incomes fall and savings actually decrease. The paradox is not merely theoretical: economists argue that this dynamic contributed significantly to the severity of the Great Depression.',
 'The Paradox of Thrift',
 'According to the passage, the paradox of thrift describes a situation where:',
 '["Individual saving is always harmful to the economy","Collective saving can paradoxically reduce total savings in the economy","Governments should discourage personal savings during recessions","Individual rational behaviour inevitably leads to beneficial economic outcomes"]',
 'Collective saving can paradoxically reduce total savings in the economy',
 'The passage explains that when all households save simultaneously, aggregate demand falls, incomes decline, and "the very attempt to save more collectively produces a situation in which … savings actually decrease".',
 'seed', true);
