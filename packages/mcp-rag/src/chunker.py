"""Markdown-aware text chunking for RAG ingestion."""

import re
from dataclasses import dataclass, field


@dataclass
class Chunk:
    text: str
    metadata: dict = field(default_factory=dict)


def _extract_image_refs(text: str) -> str:
    """Scan chunk text for image references, return comma-separated filenames."""
    refs: list[str] = []
    # Match <img src="pic/X"> and <embed src="pic/X">
    for m in re.finditer(r'<(?:img|embed)\s[^>]*src="pic/([^"]+)"', text):
        fname = m.group(1)
        if fname not in refs:
            refs.append(fname)
    return ",".join(refs)


def _clean_images_for_embedding(text: str) -> str:
    """Strip image/embed/figure HTML tags so they don't pollute embeddings."""
    # Replace <img ...> and <embed ...> with [Figure]
    text = re.sub(r"<(?:img|embed)\s[^>]*/?>", "[Figure]", text)
    # Replace <figure ...>...</figure> blocks with [Figure]
    text = re.sub(r"<figure[^>]*>.*?</figure>", "[Figure]", text, flags=re.DOTALL)
    return text


def chunk_markdown(
    text: str,
    source: str,
    max_chunk_size: int = 1500,
    overlap: int = 200,
) -> list[Chunk]:
    """Split markdown into chunks by headers, then by paragraphs if too long.

    Preserves LaTeX formulas and image references intact.
    Adds overlap between paragraph-split chunks for better retrieval.
    """
    # Remove YAML frontmatter
    text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.DOTALL)

    # Split by headers (# ## ### ####)
    sections = re.split(r"\n(?=#{1,4}\s)", text)

    chunks: list[Chunk] = []
    for section in sections:
        section = section.strip()
        if not section:
            continue

        # Extract section title from header line
        title_match = re.match(
            r"^(#{1,4})\s+(.*?)(?:\s*\{.*?\})?\s*$", section, re.MULTILINE
        )
        title = title_match.group(2).strip() if title_match else ""

        if len(section) <= max_chunk_size:
            images = _extract_image_refs(section)
            meta: dict = {"source": source, "section": title}
            if images:
                meta["images"] = images
            embedding_text = _clean_images_for_embedding(section)
            chunks.append(Chunk(text=embedding_text, metadata=meta))
        else:
            # Split long sections by double newline (paragraphs)
            paragraphs = re.split(r"\n\n+", section)
            current = ""
            for para in paragraphs:
                if len(current) + len(para) > max_chunk_size and current:
                    images = _extract_image_refs(current)
                    meta = {"source": source, "section": title}
                    if images:
                        meta["images"] = images
                    embedding_text = _clean_images_for_embedding(current.strip())
                    chunks.append(Chunk(text=embedding_text, metadata=meta))
                    # Keep tail of previous chunk as overlap
                    if overlap > 0 and len(current) > overlap:
                        current = current[-overlap:] + "\n\n" + para
                    else:
                        current = para
                else:
                    current = current + "\n\n" + para if current else para
            if current.strip():
                images = _extract_image_refs(current)
                meta = {"source": source, "section": title}
                if images:
                    meta["images"] = images
                embedding_text = _clean_images_for_embedding(current.strip())
                chunks.append(Chunk(text=embedding_text, metadata=meta))

    return chunks
