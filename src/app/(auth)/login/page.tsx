import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const { redirectTo, error } = await searchParams;
  const initialError =
    error === "oauth_failed"
      ? "Google sign-in failed. Please try again, or use email and password."
      : undefined;
  return <LoginForm redirectTo={redirectTo} initialError={initialError} />;
}
