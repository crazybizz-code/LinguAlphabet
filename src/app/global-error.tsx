"use client";

/**
 * Last-resort catch-all — fires only if an error escapes the root layout
 * itself, so it must render its own <html>/<body> and can't depend on
 * globals.css/Tailwind/Framer Motion having loaded successfully. Kept
 * intentionally minimal and self-contained for maximum resilience.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            minHeight: "100dvh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "1.5rem",
            textAlign: "center",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0F172A" }}>Something went wrong</h1>
          <p style={{ color: "#64748B" }}>Please try again.</p>
          <button
            onClick={() => reset()}
            style={{
              borderRadius: "9999px",
              background: "#FF6B00",
              color: "#FFFFFF",
              padding: "0.75rem 2rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
