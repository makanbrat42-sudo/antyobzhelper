import { Suspense } from "react";
import { LoginView } from "./view";

export const metadata = { title: "Вход" };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}
