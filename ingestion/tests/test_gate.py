from govbuy_ingest.gate import excerpt_in_document, normalise

DOC = "Buyers may award call-off contracts directly to a supplier on Lot 2\n(Cloud Software) without further competition."


def test_verbatim_substring_passes():
    assert excerpt_in_document("award call-off contracts directly to a supplier on Lot 2", DOC)


def test_whitespace_normalised():
    # the doc has a newline inside the phrase; the gate normalises whitespace
    assert excerpt_in_document("Lot 2 (Cloud Software) without further competition", DOC)


def test_fabricated_excerpt_quarantined():
    assert not excerpt_in_document("buyers must run a mini-competition on Lot 2", DOC)


def test_empty_excerpt_never_passes():
    assert not excerpt_in_document("", DOC)
    assert not excerpt_in_document("   ", DOC)


def test_case_insensitive():
    assert excerpt_in_document("CLOUD SOFTWARE", DOC)
    assert normalise("  A   b ") == "a b"
