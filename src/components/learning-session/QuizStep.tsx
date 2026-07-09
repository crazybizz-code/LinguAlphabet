"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, X } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { SESSION_STEP_CONTAINER, SESSION_STEP_CONTENT } from "./sessionStepLayout";
import type { LearningSessionContent } from "@/lib/learning-session/types";

export function QuizStep({
  content,
  onNext,
}: {
  content: LearningSessionContent;
  onNext: (correctAnswers: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);

  const questions = content.quiz;
  const question = questions[index];
  const isLast = index === questions.length - 1;

  if (!question) return null;

  function handleSelect(optionIndex: number) {
    if (answered) return;
    setSelected(optionIndex);
    setAnswered(true);
    if (optionIndex === question.correct) setScore((value) => value + 1);
  }

  function handleContinue() {
    if (isLast) {
      onNext(score);
      return;
    }
    setIndex((value) => value + 1);
    setSelected(null);
    setAnswered(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={SESSION_STEP_CONTAINER}
    >
      <div className={SESSION_STEP_CONTENT}>
        <div className="mb-6 flex items-start gap-3">
          <Tuto pose="pointing" size="md" animation="float" />
          <div className="flex-1 pt-1">
            <h2 className="text-lg font-bold text-text-primary">Quick Quiz</h2>
            <p className="text-sm text-text-secondary">Let&apos;s see what you&apos;ve learned from this session!</p>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-text-tertiary">
            Question {index + 1} of {questions.length}
          </span>
          <span className="rounded-full bg-primary-lighter px-3 py-1 text-xs font-bold text-primary">Score: {score}</span>
        </div>

        <div className="mb-6 flex gap-1.5">
          {questions.map((_, dotIndex) => (
            <div
              key={dotIndex}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                dotIndex < index ? "bg-primary" : dotIndex === index ? "bg-primary/60" : "bg-border"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="rounded-[1.75rem] bg-bg-muted p-6 sm:p-8"
          >
            <h3 className="mb-5 text-lg font-bold text-text-primary">{question.question}</h3>
            <div className="flex flex-col gap-3">
              {question.options.map((option, optionIndex) => {
                const isCorrectOption = optionIndex === question.correct;
                const isSelectedOption = optionIndex === selected;
                const showState = answered && (isCorrectOption || isSelectedOption);

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleSelect(optionIndex)}
                    disabled={answered}
                    className={`flex w-full items-center justify-between rounded-2xl border-2 p-4 text-left text-sm font-semibold transition-all ${
                      showState
                        ? isCorrectOption
                          ? "border-success/40 bg-success-soft text-success"
                          : "border-danger/40 bg-danger/10 text-danger"
                        : "border-border bg-bg-card text-text-secondary hover:border-primary/40 hover:bg-primary-lighter/50"
                    }`}
                  >
                    {option}
                    {showState && isCorrectOption && <Check className="h-5 w-5 text-success" aria-hidden="true" />}
                    {showState && isSelectedOption && !isCorrectOption && <X className="h-5 w-5 text-danger" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>

        {answered && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 flex items-start gap-3 rounded-2xl border border-primary-light bg-primary-lighter p-4"
          >
            <Tuto pose="happy" size="sm" />
            <p className="pt-0.5 text-sm leading-relaxed text-text-secondary">
              {selected === question.correct ? "That's correct! You're really getting it." : question.explanation}
            </p>
          </motion.div>
        )}

        {answered && (
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            type="button"
            onClick={handleContinue}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
          >
            {isLast ? "See Results" : "Next Question"}
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
