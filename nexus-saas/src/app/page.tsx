import { redirect } from "next/navigation";

export default function HomeRedirect() {
  // Always send users straight to auth; roles will decide
  // where they land after login.
  redirect("/login");
}
