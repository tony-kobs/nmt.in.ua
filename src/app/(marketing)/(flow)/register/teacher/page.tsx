import { redirect } from "next/navigation";

/** Paid WayForPay teacher signup is paused — free teacher signup lives on `/register`. */
export default function TeacherRegisterPage() {
  redirect("/register?role=teacher");
}
