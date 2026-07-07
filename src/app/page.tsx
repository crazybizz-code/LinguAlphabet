import { redirect } from "next/navigation";

/**
 * TEMPORARY: no landing page has been rebuilt yet in the new
 * architecture, so `/` redirects straight into the app. Replace this
 * once the landing page is built as its own screen.
 */
export default function Home() {
  redirect("/login");
}
