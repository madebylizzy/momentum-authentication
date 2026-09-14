/**
 * ============================================================================
 * MOMENTUM DESIGN SYSTEM — Token-to-CSS Variable Converter
 * ============================================================================
 *
 * PURPOSE
 * -------
 * Reads `momentum-design-system.tokens.json` and produces well-structured CSS
 * custom-property files that faithfully represent every layer of the design
 * system:
 *
 *   1. Primitives   — foundational colour palettes (tonal scales).
 *   2. Colour Roles — semantic colour assignments consumed by UI components.
 *   3. Spacing       — spatial rhythm tokens.
 *   4. Typography    — type-scale tokens (font size, weight, line-height…).
 *
 *
 * COLOUR ARCHITECTURE — IMPORTANT
 * --------------------------------
 * The design system follows a two-tier colour model:
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │  PRIMITIVES  (foundation layer — DO NOT apply directly in UI)      │
 *   │                                                                     │
 *   │  Full tonal palettes: primary 0–100, secondary 0–100, tertiary     │
 *   │  0–100, neutral, neutral-variant, error, and success.              │
 *   │  These exist so the Colour Roles can reference them.               │
 *   ├─────────────────────────────────────────────────────────────────────┤
 *   │  COLOUR ROLES  (semantic layer — USE THESE in UI code)             │
 *   │                                                                     │
 *   │  Named by *purpose*: --color-primary, --color-on-primary,          │
 *   │  --color-surface, --color-error, etc.                              │
 *   │  Each role either hard-codes a hex value or aliases a primitive     │
 *   │  via the `{primitives colors.…}` reference syntax.                 │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * This script resolves every alias reference so the generated CSS contains
 * only concrete values — no broken `var()` chains at runtime.
 *
 *
 * OUTPUT FILES
 * ------------
 *   • momentum-primitives.css   — `:root` block with primitive palette vars.
 *                                  Kept separate so teams can audit the raw
 *                                  palette without noise from semantic tokens.
 *
 *   • momentum-tokens.css       — `:root` block with colour roles, spacing,
 *                                  and typography.  This is the file you
 *                                  import in production UI code.
 *
 *   • momentum-all.css          — Single combined file (primitives + tokens)
 *                                  for convenience if you prefer one import.
 *
 *
 * USAGE
 * -----
 *   node tokens-to-css.js
 *
 *   All three CSS files are written to the same directory as this script.
 *
 *
 * CONVENTIONS
 * -----------
 *   • Variable names use kebab-case derived from the JSON keys.
 *   • Primitives are prefixed `--primitive-<palette>-<step>`.
 *   • Colour roles are prefixed `--color-<role-name>`.
 *   • Spacing tokens are prefixed `--spacing-<name>`.
 *   • Typography tokens are prefixed `--typo-<style>-<property>`.
 *   • Dimension values without explicit units become `px`.
 *   • Each generated file carries a header comment explaining its purpose
 *     and warning developers not to hand-edit the output.
 *
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");

// ─── Configuration ──────────────────────────────────────────────────────────

/** Path to the source design-token JSON file. */
const SOURCE_FILE = path.join(__dirname, "momentum-design-system.tokens.json");

/** Output file paths (written to the same directory as this script). */
const OUTPUT_PRIMITIVES = path.join(__dirname, "momentum-primitives.css");
const OUTPUT_TOKENS = path.join(__dirname, "momentum-tokens.css");
const OUTPUT_ALL = path.join(__dirname, "momentum-all.css");

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Converts an arbitrary string to a CSS-safe kebab-case identifier.
 *
 * Rules applied:
 *   1. Convert to lowercase.
 *   2. Trim leading/trailing whitespace.
 *   3. Collapse multiple consecutive spaces into a single hyphen.
 *   4. Remove any character that is not alphanumeric or a hyphen.
 *   5. Collapse multiple consecutive hyphens into one.
 *   6. Strip leading/trailing hyphens.
 *
 * @param {string} str — Human-readable token name from the JSON.
 * @returns {string}   — Valid CSS custom-property fragment (no `--` prefix).
 *
 * @example
 *   toKebab("Primary Key Color")  // "primary-key-color"
 *   toKebab("surface  countainer highest") // "surface-countainer-highest"
 */
function toKebab(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // spaces → hyphens
    .replace(/[^a-z0-9-]/g, "") // strip non-alphanumeric
    .replace(/-+/g, "-") // collapse repeated hyphens
    .replace(/^-|-$/g, ""); // trim edge hyphens
}

/**
 * Appends the correct CSS unit to a raw dimension value.
 *
 * The token JSON stores dimensions as bare numbers (e.g. `16`, `-0.4`).
 * This function converts them to CSS-ready strings:
 *   • `0`           → `"0"`       (unitless zero)
 *   • `16`          → `"16px"`
 *   • `-0.4`        → `"-0.4px"`
 *   • `"none"`      → `"none"`    (pass-through for string values)
 *
 * @param {number|string} value — Raw value from the JSON token.
 * @param {string} type         — Token type ("dimension", "number", "string").
 * @returns {string}            — CSS-ready value.
 */
function formatValue(value, type) {
  if (type === "dimension") {
    return value === 0 ? "0" : `${value}px`;
  }
  return String(value);
}

/**
 * Builds a flat lookup map from the "primitives colors" object so that
 * alias references in colour roles (e.g. `{primitives colors.primary color
 * palette.primary 50}`) can be resolved to their concrete hex values.
 *
 * The lookup key is the exact dot-path inside the curly braces, e.g.:
 *   "primitives colors.primary color palette.primary 50" → "#2F7D5A"
 *
 * @param {Object} primitivesObj — The `"primitives colors"` node from JSON.
 * @returns {Map<string, string>} — Alias path → hex value.
 */
function buildPrimitiveLookup(primitivesObj) {
  const lookup = new Map();

  for (const [paletteName, palette] of Object.entries(primitivesObj)) {
    for (const [swatchName, swatch] of Object.entries(palette)) {
      // Mirror the exact path format used in alias references:
      //   "primitives colors.<paletteName>.<swatchName>"
      const aliasPath = `primitives colors.${paletteName}.${swatchName}`;
      lookup.set(aliasPath, swatch.value);
    }
  }

  return lookup;
}

/**
 * Resolves a colour role value that may be:
 *   a) A literal hex string (e.g. "#F8F7F3")    → returned as-is.
 *   b) An alias reference  (e.g. "{primitives colors.primary color
 *      palette.primary 50}")                     → looked up in the map.
 *
 * If an alias cannot be resolved, the function logs a warning and returns
 * the raw reference string so the output remains inspectable.
 *
 * @param {string} rawValue            — The `"value"` field from the token.
 * @param {Map<string, string>} lookup — Primitive alias lookup map.
 * @returns {string}                   — Concrete hex colour value.
 */
function resolveColourValue(rawValue, lookup) {
  // Alias references are wrapped in curly braces: {path.to.token}
  const aliasMatch = rawValue.match(/^\{(.+)\}$/);

  if (!aliasMatch) {
    // It's a literal value — return as-is.
    return rawValue;
  }

  const aliasPath = aliasMatch[1];
  const resolved = lookup.get(aliasPath);

  if (!resolved) {
    console.warn(
      `  ⚠  Unresolved alias: "${aliasPath}" — using raw reference as fallback.`
    );
    return rawValue;
  }

  return resolved;
}

/**
 * Generates a timestamped header comment for a CSS output file.
 *
 * @param {string} title       — e.g. "Primitive Colour Palettes"
 * @param {string} description — Multi-line explanation of the file's role.
 * @returns {string}           — Formatted CSS block comment.
 */
function fileHeader(title, description) {
  const divider = "=".repeat(72);
  const timestamp = new Date().toISOString();

  return [
    `/* ${divider}`,
    ` * MOMENTUM DESIGN SYSTEM — ${title}`,
    ` * ${divider}`,
    ` *`,
    ...description.split("\n").map((line) => ` * ${line}`),
    ` *`,
    ` * AUTO-GENERATED — Do not edit by hand.`,
    ` * Source : momentum-design-system.tokens.json`,
    ` * Script : tokens-to-css.js`,
    ` * Date   : ${timestamp}`,
    ` * ${divider} */`,
    ``,
  ].join("\n");
}

// ─── Main Conversion Logic ─────────────────────────────────────────────────

/**
 * Entry point.  Reads the JSON, processes every token category, and writes
 * the three output CSS files.
 */
function main() {
  // ── 1. Load & Parse ─────────────────────────────────────────────────────
  console.log("┌─────────────────────────────────────────────────────────┐");
  console.log("│  Momentum Design System — Token → CSS Converter        │");
  console.log("└─────────────────────────────────────────────────────────┘");
  console.log();

  if (!fs.existsSync(SOURCE_FILE)) {
    console.error(`✖  Source file not found: ${SOURCE_FILE}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(SOURCE_FILE, "utf-8");
  const tokens = JSON.parse(raw);
  console.log(`✔  Loaded tokens from: ${path.basename(SOURCE_FILE)}`);

  // ── 2. Build Alias Lookup ───────────────────────────────────────────────
  const primitivesData = tokens["primitives colors"];
  const lookup = buildPrimitiveLookup(primitivesData);
  console.log(`✔  Built primitive lookup map (${lookup.size} entries)`);

  // ── 3. Generate Primitive Colour Variables ──────────────────────────────
  //
  //    These are the raw tonal palettes.  They are the *foundation* of the
  //    colour system but should NOT be used directly in UI code — use the
  //    colour roles instead.
  //
  //    Output format:
  //      --primitive-primary-0: #000000;
  //      --primitive-primary-10: #071A13;
  //      …

  const primitiveLines = [];
  let primitiveCount = 0;

  for (const [paletteName, palette] of Object.entries(primitivesData)) {
    // Section comment for readability.
    const sectionLabel = paletteName
      .replace(/colour/gi, "color")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    primitiveLines.push("");
    primitiveLines.push(`  /* ── ${sectionLabel} ── */`);

    for (const [swatchName, swatch] of Object.entries(palette)) {
      const varName = `--primitive-${toKebab(swatchName)}`;
      primitiveLines.push(`  ${varName}: ${swatch.value};`);
      primitiveCount++;
    }
  }

  console.log(`✔  Processed ${primitiveCount} primitive colour tokens`);

  // ── 4. Generate Colour Role Variables ───────────────────────────────────
  //
  //    Colour roles are the *semantic* colours consumed by UI components.
  //    Each role either carries a literal hex or references a primitive via
  //    the alias syntax `{primitives colors.<palette>.<swatch>}`.
  //
  //    This script resolves every alias to its concrete hex value so the
  //    generated CSS is self-contained — no dependency on primitive vars.
  //
  //    Output format:
  //      --color-primary: #2F7D5A;       /* ← resolved from primary 50 */
  //      --color-on-primary: #FFFFFF;    /* ← resolved from primary 100 */
  //      --color-surface: #F8F7F3;       /* ← literal value */
  //      …

  const roleLines = [];
  let roleCount = 0;
  const colourRoles = tokens["colour roles"];

  roleLines.push("");
  roleLines.push(
    "  /* ── Colour Roles (semantic colours — USE THESE in UI) ── */"
  );

  for (const [roleName, roleToken] of Object.entries(colourRoles)) {
    const rawValue = roleToken.value;
    const resolved = resolveColourValue(rawValue, lookup);
    const varName = `--color-${toKebab(roleName)}`;

    // Append an inline comment showing the alias origin when applicable.
    const isAlias = rawValue.startsWith("{");
    const comment = isAlias ? `  /* ${rawValue} */` : "";

    roleLines.push(`  ${varName}: ${resolved};${comment}`);
    roleCount++;
  }

  console.log(`✔  Processed ${roleCount} colour role tokens (aliases resolved)`);

  // ── 5. Generate Spacing Variables ───────────────────────────────────────
  //
  //    Spatial rhythm tokens used for margins, paddings, gaps, etc.
  //
  //    Output format:
  //      --spacing-no-spacing: 0;
  //      --spacing-extra-small: 4px;
  //      --spacing-base: 16px;
  //      …

  const spacingLines = [];
  let spacingCount = 0;
  const spacingData = tokens["spacing"];

  spacingLines.push("");
  spacingLines.push("  /* ── Spacing Scale ── */");

  for (const [spacingName, spacingToken] of Object.entries(spacingData)) {
    const varName = `--spacing-${toKebab(spacingName)}`;
    const cssValue = formatValue(spacingToken.value, spacingToken.type);
    spacingLines.push(`  ${varName}: ${cssValue};`);
    spacingCount++;
  }

  console.log(`✔  Processed ${spacingCount} spacing tokens`);

  // ── 6. Generate Typography Variables ────────────────────────────────────
  //
  //    Each typographic style (e.g. "display large") produces a family of
  //    CSS variables covering font-size, weight, line-height, letter-spacing,
  //    font-family, and font-style.
  //
  //    Output format:
  //      --typo-display-large-font-size:      40px;
  //      --typo-display-large-font-weight:    700;
  //      --typo-display-large-line-height:    48px;
  //      --typo-display-large-letter-spacing: -0.8px;
  //      --typo-display-large-font-family:    "Inter";
  //      --typo-display-large-font-style:     normal;
  //      …
  //
  //    Properties like `paragraphIndent`, `paragraphSpacing`, and `textCase`
  //    whose value is `0` or `"none"` are included for completeness but can
  //    safely be ignored in most UI code.

  const typoLines = [];
  let typoCount = 0;
  const typographyData = tokens["typography"];

  /**
   * Map of typography sub-properties we care about, in the order they
   * should appear in the CSS output.  Key = JSON property name,
   * Value = CSS variable suffix.
   */
  const TYPO_PROPERTY_MAP = [
    ["fontSize", "font-size"],
    ["fontFamily", "font-family"],
    ["fontWeight", "font-weight"],
    ["fontStyle", "font-style"],
    ["lineHeight", "line-height"],
    ["letterSpacing", "letter-spacing"],
    ["textDecoration", "text-decoration"],
    ["textCase", "text-case"],
    ["fontStretch", "font-stretch"],
    ["paragraphIndent", "paragraph-indent"],
    ["paragraphSpacing", "paragraph-spacing"],
  ];

  for (const [styleName, styleProps] of Object.entries(typographyData)) {
    const styleSlug = toKebab(styleName);

    typoLines.push("");
    typoLines.push(
      `  /* ── Typography: ${styleName
        .replace(/\b\w/g, (c) => c.toUpperCase())} ── */`
    );

    for (const [jsonProp, cssSuffix] of TYPO_PROPERTY_MAP) {
      const propToken = styleProps[jsonProp];
      if (!propToken) continue; // guard against missing properties

      const varName = `--typo-${styleSlug}-${cssSuffix}`;
      let cssValue;

      if (jsonProp === "fontFamily") {
        // Wrap font-family values in quotes for CSS correctness.
        cssValue = `"${propToken.value}"`;
      } else if (jsonProp === "fontWeight") {
        // Font-weight is a pure number — no unit.
        cssValue = String(propToken.value);
      } else {
        cssValue = formatValue(propToken.value, propToken.type);
      }

      typoLines.push(`  ${varName}: ${cssValue};`);
      typoCount++;
    }
  }

  console.log(`✔  Processed ${typoCount} typography tokens`);

  // ── 7. Assemble & Write Output Files ────────────────────────────────────

  // ---- momentum-primitives.css ----
  const primitivesCSS = [
    fileHeader(
      "Primitive Colour Palettes",
      [
        "Foundation-layer colour tokens — full tonal scales for every palette.",
        "",
        "⚠  DO NOT reference these variables directly in UI component styles.",
        "   They exist as the raw material from which Colour Roles are derived.",
        "   Always use the semantic --color-* variables from momentum-tokens.css",
        "   when styling components.",
        "",
        "Palettes included:",
        "  • Key Colors      — seed hues that generate each palette.",
        "  • Primary          — brand primary tonal scale (0–100).",
        "  • Secondary        — brand secondary tonal scale (0–100).",
        "  • Tertiary         — accent / tertiary tonal scale (0–100).",
        "  • Neutral          — neutral grey tonal scale (0–100).",
        "  • Neutral Variant  — alternate neutral tonal scale (0–100).",
        "  • Error            — error/destructive tonal scale (0–100).",
        "  • Success          — success/positive tonal scale (0–100).",
      ].join("\n")
    ),
    `:root {`,
    primitiveLines.join("\n"),
    `}`,
    ``,
  ].join("\n");

  fs.writeFileSync(OUTPUT_PRIMITIVES, primitivesCSS, "utf-8");
  console.log(`\n📄 Written: ${path.basename(OUTPUT_PRIMITIVES)}`);

  // ---- momentum-tokens.css ----
  const tokensCSS = [
    fileHeader(
      "Design Tokens (Colour Roles · Spacing · Typography)",
      [
        "Semantic design tokens for production UI consumption.",
        "",
        "COLOUR ROLES",
        "  These --color-* variables map visual *purpose* (primary, surface,",
        "  error …) to concrete colours.  Every alias reference to the",
        "  primitive palette has been resolved — values are self-contained.",
        "",
        "  ✅  Use --color-primary, --color-on-surface, --color-error, etc.",
        "  ❌  Do NOT use --primitive-* variables in component styles.",
        "",
        "SPACING",
        "  A consistent spatial scale from 0 (no spacing) to 64px (display).",
        "",
        "TYPOGRAPHY",
        "  Type styles following Material-style naming: display, headline,",
        "  title, body, and label — each in large / medium / small variants.",
        "  Every style exposes font-size, weight, line-height, letter-spacing,",
        "  font-family, and font-style as individual custom properties.",
      ].join("\n")
    ),
    `:root {`,
    roleLines.join("\n"),
    ``,
    spacingLines.join("\n"),
    ``,
    typoLines.join("\n"),
    `}`,
    ``,
  ].join("\n");

  fs.writeFileSync(OUTPUT_TOKENS, tokensCSS, "utf-8");
  console.log(`📄 Written: ${path.basename(OUTPUT_TOKENS)}`);

  // ---- momentum-all.css ----
  const allCSS = [
    fileHeader(
      "Complete Design System (Primitives + Tokens)",
      [
        "Single-file import containing every design token.",
        "",
        "This file merges:",
        "  1. Primitive colour palettes  (--primitive-*)",
        "  2. Colour roles               (--color-*)",
        "  3. Spacing scale              (--spacing-*)",
        "  4. Typography styles          (--typo-*)",
        "",
        "Import this file if you prefer a single <link> or @import.",
        "For finer-grained control, import momentum-primitives.css and",
        "momentum-tokens.css separately.",
        "",
        "⚠  REMINDER: Only --color-* variables should be used in UI code.",
        "   --primitive-* variables are foundational and must not be applied",
        "   directly to component styles.",
      ].join("\n")
    ),
    `:root {`,
    ``,
    `  /* ================================================================== */`,
    `  /*  SECTION 1 — PRIMITIVE COLOUR PALETTES                             */`,
    `  /*  Foundation layer. Do NOT use directly in UI component styles.      */`,
    `  /* ================================================================== */`,
    primitiveLines.join("\n"),
    ``,
    `  /* ================================================================== */`,
    `  /*  SECTION 2 — COLOUR ROLES                                          */`,
    `  /*  Semantic layer. USE THESE in all UI component styles.              */`,
    `  /* ================================================================== */`,
    roleLines.join("\n"),
    ``,
    `  /* ================================================================== */`,
    `  /*  SECTION 3 — SPACING SCALE                                         */`,
    `  /* ================================================================== */`,
    spacingLines.join("\n"),
    ``,
    `  /* ================================================================== */`,
    `  /*  SECTION 4 — TYPOGRAPHY                                            */`,
    `  /* ================================================================== */`,
    typoLines.join("\n"),
    `}`,
    ``,
  ].join("\n");

  fs.writeFileSync(OUTPUT_ALL, allCSS, "utf-8");
  console.log(`📄 Written: ${path.basename(OUTPUT_ALL)}`);

  // ── 8. Summary ──────────────────────────────────────────────────────────
  const totalVars = primitiveCount + roleCount + spacingCount + typoCount;
  console.log();
  console.log("┌─────────────────────────────────────────────────────────┐");
  console.log(
    `│  ✔  Conversion complete — ${totalVars} CSS custom properties generated  │`
  );
  console.log("├─────────────────────────────────────────────────────────┤");
  console.log(
    `│  Primitives : ${String(primitiveCount).padStart(4)} vars  (foundation — don't use in UI) │`
  );
  console.log(
    `│  Roles      : ${String(roleCount).padStart(4)} vars  (semantic  — USE in UI)        │`
  );
  console.log(
    `│  Spacing    : ${String(spacingCount).padStart(4)} vars                                │`
  );
  console.log(
    `│  Typography : ${String(typoCount).padStart(4)} vars                                │`
  );
  console.log("└─────────────────────────────────────────────────────────┘");
}

// ─── Run ────────────────────────────────────────────────────────────────────
main();
