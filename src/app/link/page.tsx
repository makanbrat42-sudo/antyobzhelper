import { Suspense } from "react";
import { LinkView } from "./view";

export const metadata = { title: "Подтверждение VK" };

export default function LinkPage() {
  return (
    <Suspense>
      <LinkView />
    </Suspense>
  );
}
