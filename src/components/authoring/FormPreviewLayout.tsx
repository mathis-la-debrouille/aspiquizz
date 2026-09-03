"use client";

import { useState, type ReactNode } from "react";
import { Tabs } from "@/components/ui/Tabs";

/**
 * The two-pane authoring shell every per-type form renders into: form and live preview side by
 * side from `sm` up, a Formulaire/Aperçu tab switch below that. Was pasted into six forms
 * verbatim; a change to the breakpoint or the tab labels meant six edits.
 */
export function FormPreviewLayout({ form, preview }: { form: ReactNode; preview: ReactNode }) {
  const [mobileTab, setMobileTab] = useState("form");
  return (
    <div className="flex flex-col gap-4">
      <div className="sm:hidden">
        <Tabs
          tabs={[
            { id: "form", label: "Formulaire" },
            { id: "preview", label: "Aperçu" },
          ]}
          value={mobileTab}
          onChange={setMobileTab}
        />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className={mobileTab === "form" ? "block" : "hidden sm:block"}>{form}</div>
        <div className={mobileTab === "preview" ? "block" : "hidden sm:block"}>{preview}</div>
      </div>
    </div>
  );
}
