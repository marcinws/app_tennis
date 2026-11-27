---
change_id: notes-queue-drops-on-any-4xx
title: Kolejka notatek nie usuwa wpisów przy obcych odpowiedziach 4xx
status: implemented
created: 2026-11-26
updated: 2026-11-27
archived_at: null
---

## Notes

— Kolejka notatek i obserwacji usuwa wpis z telefonu przy dowolnej odpowiedzi 4xx (także 403 z WAF, HTML 404 po wdrożeniu), bez śladu na serwerze. Źródło: ustalenie N1 (oraz N2) w context/audits/observability/2026-11-26_point-sync-notes-deletion.md.
