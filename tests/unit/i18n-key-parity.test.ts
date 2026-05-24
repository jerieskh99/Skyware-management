import { describe, it, expect } from "vitest";
import en from "@/lib/i18n/en.json";
import he from "@/lib/i18n/he.json";

function collectPaths(node: unknown, prefix = ""): string[] {
  if (node === null || typeof node !== "object") {
    return [prefix];
  }
  const paths: string[] = [];
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${k}` : k;
    paths.push(...collectPaths(v, next));
  }
  return paths;
}

describe("i18n key parity", () => {
  it("en.json and he.json contain identical dot-path key sets", () => {
    const enPaths = new Set(collectPaths(en));
    const hePaths = new Set(collectPaths(he));

    const missingInHe = [...enPaths].filter((p) => !hePaths.has(p)).sort();
    const missingInEn = [...hePaths].filter((p) => !enPaths.has(p)).sort();

    const lines: string[] = [];
    if (missingInHe.length > 0) {
      lines.push(`Missing in he.json (${missingInHe.length}):`);
      for (const p of missingInHe) lines.push(`  - ${p}`);
    }
    if (missingInEn.length > 0) {
      lines.push(`Missing in en.json (${missingInEn.length}):`);
      for (const p of missingInEn) lines.push(`  - ${p}`);
    }

    expect(lines.join("\n") || "ok").toBe("ok");
  });

  it("every leaf value is a non-empty string in both locales", () => {
    function findEmpties(node: unknown, prefix = ""): string[] {
      if (typeof node === "string") {
        return node.length === 0 ? [prefix] : [];
      }
      if (node === null || typeof node !== "object") {
        return [`${prefix} (non-string leaf)`];
      }
      const bad: string[] = [];
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        const next = prefix ? `${prefix}.${k}` : k;
        bad.push(...findEmpties(v, next));
      }
      return bad;
    }

    const badEn = findEmpties(en);
    const badHe = findEmpties(he);
    expect({ en: badEn, he: badHe }).toEqual({ en: [], he: [] });
  });
});
