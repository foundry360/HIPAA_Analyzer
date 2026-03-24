#!/usr/bin/env python3
"""Build DEPLOY-CHEAT-SHEET.pdf from DEPLOY-CHEAT-SHEET.md (requires fpdf2: pip install fpdf2)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    from fpdf import FPDF
except ImportError:
    print("Install fpdf2: pip install fpdf2", file=sys.stderr)
    sys.exit(1)


class PDF(FPDF):
    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")


def wrap_long(s: str, max_len: int = 92) -> str:
    """Break very long tokens/lines so fpdf multi_cell can wrap."""
    if len(s) <= max_len:
        return s
    parts: list[str] = []
    while len(s) > max_len:
        parts.append(s[:max_len])
        s = s[max_len:]
    if s:
        parts.append(s)
    return "\n".join(parts)


def ascii_safe(s: str) -> str:
    """Helvetica core fonts only support Latin-1; normalize common Unicode punctuation."""
    return (
        s.replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2192", "->")
        .replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
    )


def main() -> None:
    root = Path(__file__).resolve().parent
    md_path = root / "DEPLOY-CHEAT-SHEET.md"
    out_path = root / "DEPLOY-CHEAT-SHEET.pdf"
    text = md_path.read_text(encoding="utf-8")

    pdf = PDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "", 11)

    lines = text.splitlines()
    i = 0
    in_code = False
    while i < len(lines):
        line = lines[i]
        if line.strip().startswith("```"):
            in_code = not in_code
            i += 1
            continue
        if in_code:
            pdf.set_font("Courier", "", 7)
            safe = wrap_long(ascii_safe(line) or " ")
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 4, safe)
            pdf.set_font("Helvetica", "", 11)
            i += 1
            continue
        if line.startswith("# "):
            pdf.set_font("Helvetica", "B", 16)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 8, ascii_safe(line[2:].strip()))
            pdf.ln(2)
            pdf.set_font("Helvetica", "", 11)
        elif line.startswith("## "):
            pdf.ln(3)
            pdf.set_font("Helvetica", "B", 13)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 7, ascii_safe(line[3:].strip()))
            pdf.ln(1)
            pdf.set_font("Helvetica", "", 11)
        elif line.startswith("|") and "---" not in line:
            pdf.set_font("Helvetica", "", 9)
            clean = wrap_long(ascii_safe(re.sub(r"\*\*([^*]+)\*\*", r"\1", line)))
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 5, clean)
            pdf.set_font("Helvetica", "", 11)
        elif line.strip() == "---":
            pdf.ln(2)
        elif line.strip().startswith("*") and line.strip().endswith("*") and not line.strip().startswith("**"):
            pdf.set_font("Helvetica", "I", 10)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 6, ascii_safe(line.strip().strip("*").strip()))
            pdf.set_font("Helvetica", "", 11)
        elif line.strip():
            out = re.sub(r"\*\*([^*]+)\*\*", r"\1", line)
            out = re.sub(r"`([^`]+)`", r"\1", out)
            safe = wrap_long(ascii_safe(out))
            if not safe.strip():
                i += 1
                continue
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 6, safe)
        i += 1

    pdf.output(str(out_path))
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
