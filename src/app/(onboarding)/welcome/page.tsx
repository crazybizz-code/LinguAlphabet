"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Tuto } from "@/components/mascot/Tuto";
import { Button } from "@/components/ui/Button";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";

export default function WelcomePage() {
  const router = useRouter();

  return (
    <OnboardingLayout step={1} totalSteps={7} variant="checklist">
      <Tuto pose="wave" size="xl" animation="float" priority className="mx-auto mb-8" />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }}>
        <p className="mb-3 text-small font-semibold uppercase tracking-wide text-primary">Your AI Coach</p>
        <h1 className="mb-4 font-heading text-display font-extrabold leading-tight text-text-primary">
          Hi, I&apos;m Tuto!
        </h1>
        <p className="mx-auto mb-2 max-w-md text-lg leading-relaxed text-text-secondary">
          I&apos;ll be your personal English coach. I&apos;ll create a learning path designed just for you.
        </p>
        <p className="mb-10 text-small text-text-tertiary">Let&apos;s get to know each other first.</p>
      </motion.div>
      <Button variant="primary" className="h-12 rounded-full px-8" arrow onClick={() => router.push("/name")}>
        Let&apos;s Go
      </Button>
    </OnboardingLayout>
  );
}
