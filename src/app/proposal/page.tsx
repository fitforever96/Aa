"use client";

import { Suspense } from "react";
import { Workspace } from "@/components/proposal/Workspace";

export default function ProposalPage() {
  return (
    <Suspense>
      <Workspace />
    </Suspense>
  );
}
