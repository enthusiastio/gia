export interface Chunk {
  heading: string | null;
  content: string;
}

/** ~4 chars per token is close enough for budgeting without a tokenizer dep. */
const TARGET_CHARS = 3600;
const OVERLAP_CHARS = 500;
const MIN_CHARS = 120;

interface Section {
  headingPath: string[];
  body: string;
}

/**
 * Splits markdown on ATX headings, keeping the full heading path for each
 * section so a retrieved chunk still reports where it came from.
 */
function splitIntoSections(markdown: string): Section[] {
  const lines = markdown.split(/\r?\n/);
  const sections: Section[] = [];
  let path: string[] = [];
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body) sections.push({ headingPath: [...path], body });
    buffer = [];
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;

    const heading = inFence ? null : /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      const text = heading[2].replace(/#+\s*$/, '').trim();
      // Index by depth rather than appending. Documents routinely skip a level
      // (# straight to ###); appending would seat that heading at the wrong
      // depth and leave it pinned there for every section that followed.
      path = path.slice(0, level - 1);
      while (path.length < level - 1) path.push('');
      path.push(text);
    } else {
      buffer.push(line);
    }
  }
  flush();

  return sections;
}

const TABLE_ROWS_PER_CHUNK = 8;
const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isTableDivider = (line: string) => /^\s*\|[\s:|-]+\|\s*$/.test(line);

/**
 * Breaks long markdown tables into row groups, repeating the header in each.
 *
 * Reference documents often end in one long alphabetical table of every
 * measured variant. Embedded whole, a single row's meaning is averaged away
 * among dozens of unrelated ones, so the row answering the question never
 * surfaces. Smaller groups keep each row's signal legible, and repeating the
 * header keeps every group readable on its own.
 */
function splitLongTables(body: string): string[] {
  const lines = body.split('\n');
  const pieces: string[] = [];
  let prose: string[] = [];
  let i = 0;

  const flushProse = () => {
    const text = prose.join('\n').trim();
    if (text) pieces.push(text);
    prose = [];
  };

  while (i < lines.length) {
    if (!isTableRow(lines[i])) {
      prose.push(lines[i]);
      i += 1;
      continue;
    }

    const start = i;
    while (i < lines.length && isTableRow(lines[i])) i += 1;
    const table = lines.slice(start, i);

    const header = isTableDivider(table[1] ?? '') ? table.slice(0, 2) : [];
    const rows = table.slice(header.length);

    if (rows.length <= TABLE_ROWS_PER_CHUNK) {
      prose.push(...table);
      continue;
    }

    flushProse();
    for (let r = 0; r < rows.length; r += TABLE_ROWS_PER_CHUNK) {
      pieces.push([...header, ...rows.slice(r, r + TABLE_ROWS_PER_CHUNK)].join('\n'));
    }
  }

  flushProse();
  return pieces;
}

/** Prefers paragraph breaks, then line breaks, then sentence ends. */
function splitOversizedBody(body: string): string[] {
  if (body.length <= TARGET_CHARS) return [body];

  const paragraphs = body.split(/\n{2,}/);
  const pieces: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current.trim()) pieces.push(current.trim());
    current = '';
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > TARGET_CHARS) {
      pushCurrent();
      // A single paragraph (or table) larger than the target: fall back to
      // line boundaries, then to a hard slice for pathological input.
      const units = paragraph.split(/\n/).flatMap((line) =>
        line.length > TARGET_CHARS ? (line.match(/[^.!?]+[.!?]+|\S+/g) ?? [line]) : [line]
      );
      for (const unit of units) {
        if (current.length + unit.length + 1 > TARGET_CHARS) pushCurrent();
        current += (current ? '\n' : '') + unit;
      }
      pushCurrent();
      continue;
    }

    if (current.length + paragraph.length + 2 > TARGET_CHARS) pushCurrent();
    current += (current ? '\n\n' : '') + paragraph;
  }
  pushCurrent();

  // Carry a tail of the previous piece into the next so facts spanning a
  // boundary stay retrievable from either side.
  return pieces.map((piece, i) => {
    if (i === 0) return piece;
    const prev = pieces[i - 1];
    const overlap = prev.slice(Math.max(0, prev.length - OVERLAP_CHARS));
    return `${overlap}\n\n${piece}`;
  });
}

export function chunkMarkdown(markdown: string): Chunk[] {
  const sections = splitIntoSections(markdown);
  const chunks: Chunk[] = [];

  for (const section of sections) {
    const heading = section.headingPath.filter(Boolean).join(' > ') || null;
    const bodies = splitLongTables(section.body).flatMap(splitOversizedBody);
    for (const body of bodies) {
      if (!body.trim()) continue;
      chunks.push({ heading, content: body.trim() });
    }
  }

  // Fold away slivers (stub sections, short data tables) rather than embedding
  // near-empty text. The folded section's own heading is written into the body
  // so it survives in the embedded text and stays searchable.
  const merged: Chunk[] = [];
  for (const chunk of chunks) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      chunk.content.length < MIN_CHARS &&
      prev.content.length + chunk.content.length < TARGET_CHARS
    ) {
      const label = lastSegment(chunk.heading);
      prev.content += label && label !== lastSegment(prev.heading)
        ? `\n\n${label}\n${chunk.content}`
        : `\n\n${chunk.content}`;
    } else {
      merged.push(chunk);
    }
  }

  return merged;
}

function lastSegment(heading: string | null): string {
  return heading ? heading.split(' > ').pop() ?? '' : '';
}

/** How much of the document description rides along with each chunk. */
const CONTEXT_CHARS = 240;

/**
 * What actually gets embedded. Chunk bodies here are often terse data tables
 * whose vectors carry almost no topical signal on their own, so each one is
 * prefixed with the document title, heading path, a slice of the document
 * description and its tags. That framing is what lets a question about
 * "inflammation" reach a table of hs-CRP values that never uses the word.
 */
export function embeddableText(
  chunk: Chunk,
  context?: { title: string; description?: string | null; tags?: string[] }
): string {
  const parts: string[] = [];
  if (context) {
    parts.push(chunk.heading ? `${context.title} > ${chunk.heading}` : context.title);
    if (context.description) parts.push(context.description.slice(0, CONTEXT_CHARS));
    if (context.tags?.length) parts.push(`Tags: ${context.tags.join(', ')}`);
  } else if (chunk.heading) {
    parts.push(chunk.heading);
  }
  parts.push(chunk.content);
  return parts.join('\n\n');
}
