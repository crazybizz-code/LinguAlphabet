// ============================================================
// assessment.js — Adaptive CEFR assessment engine (no UI)
//
// Pure logic extracted from the old onboarding flow: selects the next
// adaptive question and grades a completed assessment into CEFR level,
// per-skill scores, and a recommended goal/first lesson.
// ============================================================

const SKILLS = ['vocabulary', 'grammar', 'reading', 'listening', 'comprehension'];

// Round 1 (index 0-4) asks each skill at medium difficulty. Round 2
// (index 5-9) re-tests the same skill at 'hard' or 'easy' depending on
// whether the round-1 question was answered correctly.
export function getAdaptiveQuestion(questions, index, answers) {
  if (index < 5) {
    const skill = SKILLS[index];
    return questions.find(q => q.skill === skill && q.difficulty === 'medium');
  }

  const skill = SKILLS[index - 5];
  const firstQ = questions.find(q => q.skill === skill && q.difficulty === 'medium');
  const firstQCorrect = answers[firstQ.id] === firstQ.correct;
  const targetDiff = firstQCorrect ? 'hard' : 'easy';
  return questions.find(q => q.skill === skill && q.difficulty === targetDiff);
}

export function gradeAssessment(questions, answers, podcasts = []) {
  const resultScores = {};

  SKILLS.forEach(skill => {
    const qMedium = questions.find(q => q.skill === skill && q.difficulty === 'medium');
    const qEasy = questions.find(q => q.skill === skill && q.difficulty === 'easy');
    const qHard = questions.find(q => q.skill === skill && q.difficulty === 'hard');

    const correctMedium = answers[qMedium.id] === qMedium.correct;
    if (correctMedium) {
      const correctHard = answers[qHard.id] === qHard.correct;
      resultScores[skill] = correctHard ? 100 : 70;
    } else {
      const correctEasy = answers[qEasy.id] === qEasy.correct;
      resultScores[skill] = correctEasy ? 40 : 10;
    }
  });

  const overallScore = Math.round(
    (resultScores.vocabulary + resultScores.grammar + resultScores.reading + resultScores.listening + resultScores.comprehension) / 5
  );

  let cefr = 'A1';
  let friendlyLevel = 'Beginner';
  if (overallScore >= 90) { cefr = 'C1'; friendlyLevel = 'Advanced'; }
  else if (overallScore >= 70) { cefr = 'B2'; friendlyLevel = 'Upper Intermediate'; }
  else if (overallScore >= 50) { cefr = 'B1'; friendlyLevel = 'Intermediate'; }
  else if (overallScore >= 30) { cefr = 'A2'; friendlyLevel = 'Elementary'; }

  const scores = {
    listening: resultScores.listening,
    vocabulary: resultScores.vocabulary,
    grammar: resultScores.grammar,
    comprehension: resultScores.comprehension,
    retention: resultScores.reading
  };

  const strongest = SKILLS.reduce((a, b) => (resultScores[a] > resultScores[b] ? a : b));
  const weakest = SKILLS.reduce((a, b) => (resultScores[a] < resultScores[b] ? a : b));

  let recommendedGoal = 'General English';
  let suggestedDailyMinutes = 20;
  if (cefr === 'A1' || cefr === 'A2') { recommendedGoal = 'General English'; suggestedDailyMinutes = 15; }
  else if (cefr === 'B1') { recommendedGoal = 'Speaking Fluency'; suggestedDailyMinutes = 30; }
  else if (cefr === 'B2') { recommendedGoal = 'IELTS Preparation'; suggestedDailyMinutes = 30; }
  else if (cefr === 'C1') { recommendedGoal = 'Academic English'; suggestedDailyMinutes = 45; }

  const recommendedFirstLesson = podcasts.find(p => p.cefrLevel === cefr) || podcasts[0] || null;

  return {
    cefr,
    friendlyLevel,
    overallScore,
    scores,
    strongest,
    weakest,
    recommendedGoal,
    suggestedDailyMinutes,
    recommendedFirstLesson
  };
}
