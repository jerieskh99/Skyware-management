"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Check, X, Trash2 } from "lucide-react";

type Section =
  | "network"
  | "servers"
  | "hosting"
  | "contacts"
  | "vendors"
  | "security"
  | "backup"
  | "other";

const SECTION_LABELS: Record<Section, string> = {
  network: "Network & Infrastructure",
  servers: "Servers & VMs",
  hosting: "Hosting & Domains",
  contacts: "Key Contacts",
  vendors: "Vendors & Suppliers",
  security: "Security & Access",
  backup: "Backup & Recovery",
  other: "Other Notes",
};

const ALL_SECTIONS: Section[] = [
  "network",
  "servers",
  "hosting",
  "contacts",
  "vendors",
  "security",
  "backup",
  "other",
];

interface Note {
  id: string;
  section: Section;
  content: string;
  lastEditedAt: string | Date;
  lastEditedBy: { id: string; displayName: string };
}

interface Props {
  clientId: string;
  initialNotes: Note[];
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function EnvironmentNotesSection({ clientId, initialNotes }: Props) {
  const router = useRouter();

  const [notes, setNotes] = useState<Record<Section, string>>(() => {
    const map = {} as Record<Section, string>;
    for (const s of ALL_SECTIONS) map[s] = "";
    for (const n of initialNotes) map[n.section as Section] = n.content;
    return map;
  });

  const [noteIds, setNoteIds] = useState<Record<Section, string | null>>(() => {
    const map = {} as Record<Section, string | null>;
    for (const s of ALL_SECTIONS) map[s] = null;
    for (const n of initialNotes) map[n.section as Section] = n.id;
    return map;
  });

  const [metaMap, setMetaMap] = useState<Record<Section, { displayName: string; editedAt: Date } | null>>(() => {
    const map = {} as Record<Section, { displayName: string; editedAt: Date } | null>;
    for (const s of ALL_SECTIONS) map[s] = null;
    for (const n of initialNotes) {
      map[n.section as Section] = {
        displayName: n.lastEditedBy.displayName,
        editedAt: new Date(n.lastEditedAt),
      };
    }
    return map;
  });

  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function startEdit(section: Section) {
    setEditingSection(section);
    setDraftContent(notes[section]);
  }

  function cancelEdit() {
    setEditingSection(null);
    setDraftContent("");
  }

  function saveSection(section: Section) {
    if (!draftContent.trim()) {
      setErrors((prev) => ({ ...prev, [section]: "Content cannot be empty." }));
      return;
    }
    setErrors((prev) => ({ ...prev, [section]: "" }));

    startTransition(async () => {
      const res = await fetch(`/api/clients/${clientId}/environment-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, content: draftContent.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setErrors((prev) => ({ ...prev, [section]: body.error ?? "Save failed." }));
        return;
      }

      const saved = await res.json() as { id: string; lastEditedAt: string };
      setNoteIds((prev) => ({ ...prev, [section]: saved.id }));
      setNotes((prev) => ({ ...prev, [section]: draftContent.trim() }));
      setMetaMap((prev) => ({
        ...prev,
        [section]: { displayName: "You", editedAt: new Date(saved.lastEditedAt) },
      }));
      setEditingSection(null);
      router.refresh();
    });
  }

  function clearSection(section: Section) {
    const noteId = noteIds[section];
    if (!noteId) return;
    setErrors((prev) => ({ ...prev, [section]: "" }));

    startTransition(async () => {
      const res = await fetch(
        `/api/clients/${clientId}/environment-notes/${noteId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setErrors((prev) => ({ ...prev, [section]: body.error ?? "Clear failed." }));
        return;
      }

      setNotes((prev) => ({ ...prev, [section]: "" }));
      setNoteIds((prev) => ({ ...prev, [section]: null }));
      setMetaMap((prev) => ({ ...prev, [section]: null }));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Reference notes only. Do not store passwords or secrets here.
      </p>
      {ALL_SECTIONS.map((section) => {
        const content = notes[section];
        const isEditing = editingSection === section;
        const meta = metaMap[section];

        return (
          <div key={section} className="rounded-lg border">
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
              <span className="text-sm font-medium">{SECTION_LABELS[section]}</span>
              {!isEditing && (
                <div className="flex items-center gap-1">
                  {noteIds[section] && (
                    <button
                      onClick={() => clearSection(section)}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      disabled={isPending}
                      title="Clear this section"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(section)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    disabled={isPending}
                  >
                    <Pencil className="h-3 w-3" />
                    {content ? "Edit" : "Add note"}
                  </button>
                </div>
              )}
            </div>

            <div className="p-4">
              {isEditing ? (
                <div className="space-y-2">
                  <Textarea
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                    rows={4}
                    disabled={isPending}
                    dir="auto"
                    placeholder={`Notes about ${SECTION_LABELS[section].toLowerCase()}...`}
                    className="text-sm"
                    autoFocus
                  />
                  {errors[section] && (
                    <p className="text-xs text-destructive">{errors[section]}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveSection(section)}
                      disabled={isPending}
                    >
                      <Check className="me-1.5 h-3.5 w-3.5" />
                      {isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={cancelEdit}
                      disabled={isPending}
                    >
                      <X className="me-1.5 h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : content ? (
                <div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed" dir="auto">
                    {content}
                  </p>
                  {meta && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Last edited by {meta.displayName} on {formatDate(meta.editedAt)}
                    </p>
                  )}
                  {errors[section] && (
                    <p className="mt-1 text-xs text-destructive">{errors[section]}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No notes yet.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
