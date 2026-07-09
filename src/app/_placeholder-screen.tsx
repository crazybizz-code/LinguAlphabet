/**
 * TEMPORARY. Renders just enough for a route to be navigable and
 * visually sane while the foundation is being verified — delete each
 * usage as its real screen is built, screen-by-screen, per the approved
 * workflow. Not part of the production component library (hence the
 * leading underscore / not living under components/).
 */
export function PlaceholderScreen({ name, route }: { name: string; route: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-bg px-6 text-center">
      <p className="text-caption uppercase tracking-[0.05em] text-text-tertiary">
        Route wired, screen not yet built
      </p>
      <h1 className="text-heading font-bold text-text-primary">{name}</h1>
      <p className="text-caption text-text-secondary">{route}</p>
    </div>
  );
}
