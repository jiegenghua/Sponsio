"""Tests for sponsio/runtime/spinner.py — ANSI progress spinner."""

from __future__ import annotations

import io
import sys
from unittest.mock import patch

from sponsio.runtime.spinner import Spinner


class _FakeTTYStream(io.StringIO):
    """StringIO that reports as a TTY — lets us assert spinner behaviour
    without actually attaching to a terminal in CI."""

    def isatty(self) -> bool:
        return True


class TestSpinner:
    def test_non_tty_prints_label_immediately(self):
        # When stderr isn't a tty, start() prints the label and exits —
        # no thread, no animation.  This is the CI / pipe / docker path.
        buf = io.StringIO()  # plain StringIO is *not* a tty
        with patch.object(sys, "stderr", buf):
            spin = Spinner()
            spin.start("· Running LLM inference …")
            spin.stop("· LLM inference done in 0.5s")
        out = buf.getvalue()
        assert "Running LLM inference" in out
        assert "done in 0.5s" in out
        # No ANSI cursor commands — non-tty mode is plain prints.
        assert "\x1b[2K" not in out

    def test_tty_emits_ansi_frames(self):
        buf = _FakeTTYStream()
        with patch.object(sys, "stderr", buf):
            spin = Spinner()
            spin.start("· Running LLM inference …")
            # Let the worker thread emit at least one frame.
            import time

            time.sleep(0.15)
            spin.stop("· LLM inference done in 0.5s")
        out = buf.getvalue()
        # ANSI line-clear sequence appears (it's the single-redraw
        # mechanism).  We don't assert specific frame glyphs because
        # which frames render depends on timing.
        assert "\x1b[2K" in out
        # Final message printed after the line clear.
        assert "done in 0.5s" in out

    def test_idempotent_stop(self):
        # stop() before start() should be a no-op, not crash.
        buf = io.StringIO()
        with patch.object(sys, "stderr", buf):
            spin = Spinner()
            spin.stop()  # nothing running
            spin.stop()  # still nothing running
        # Empty output — no spinner ever ran.
        assert buf.getvalue() == ""

    def test_double_start_does_not_spawn_two_threads(self):
        # Calling start() twice without stop in between is a no-op on
        # the second call (defensive — we'd otherwise leak threads).
        buf = _FakeTTYStream()
        with patch.object(sys, "stderr", buf):
            spin = Spinner()
            spin.start("first")
            first_thread = spin._thread
            spin.start("second")
            second_thread = spin._thread
            spin.stop()
        assert first_thread is second_thread, "second start spawned a new thread"

    def test_trailing_ellipsis_drives_animated_tail_dots_not_inline(self):
        # The CLI's progress sink uses a trailing ``…`` as the
        # spinner-trigger sentinel.  Once rendering, the dots are
        # animated per-frame from ``_DOT_FRAMES`` alongside the
        # rotating braille glyph (see ``_wait_dots`` flag), so the
        # ``…`` shouldn't survive in the static label OR appear
        # inline as spaces in the printed output.  The non-TTY
        # fallback just prints the bare label since animation is
        # meaningless in CI logs.
        buf = io.StringIO()  # non-tty path prints label once, no dots
        with patch.object(sys, "stderr", buf):
            spin = Spinner()
            spin.start("· Running LLM inference …")
            spin.stop()
        out = buf.getvalue()
        assert "Running LLM inference" in out
        assert "…" not in out

    def test_animated_tail_dots_render_in_tty_mode(self):
        # In TTY mode the worker thread cycles through
        # ``_DOT_FRAMES`` so the line tail visibly animates.  We
        # assert at least one cycled state lands in the buffer.
        buf = _FakeTTYStream()
        with patch.object(sys, "stderr", buf):
            spin = Spinner()
            spin.start("· Running LLM inference …")
            import time

            # Long enough to cross at least one ``_DOT_FRAMES``
            # boundary (3 frames × 100ms = 300ms).
            time.sleep(0.4)
            spin.stop()
        out = buf.getvalue()
        # Some dot pattern from _DOT_FRAMES should have been emitted
        # to the buffer during the spin loop.
        assert ". . ." in out or ". ." in out

    def test_label_without_ellipsis_unchanged(self):
        # Defensive: a caller that didn't follow the ``…`` convention
        # shouldn't have its label silently mutated.
        buf = io.StringIO()
        with patch.object(sys, "stderr", buf):
            spin = Spinner()
            spin.start("· Running LLM inference")
            spin.stop()
        out = buf.getvalue()
        assert "Running LLM inference" in out

    def test_stop_clears_line_when_no_final_message(self):
        # stop(None) just clears the spinner line — the caller then
        # prints whatever should follow.  Useful when the next emit is
        # going to write its own bullet.
        buf = _FakeTTYStream()
        with patch.object(sys, "stderr", buf):
            spin = Spinner()
            spin.start("running")
            import time

            time.sleep(0.12)
            spin.stop()
        out = buf.getvalue()
        # The line-clear ANSI is present from both the spinner refreshes
        # and the final stop() call.
        assert out.endswith("\x1b[2K")
