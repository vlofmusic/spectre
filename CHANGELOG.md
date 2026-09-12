# Changelog

## 2026-09-12 — version 7 source update

- Redesigned the shared footer with an oversized cropped Fusion emblem, clearer navigation and contact links, and a finite pixel/ASCII pointer response.
- Added five labelled visual placeholders to the example project pack, with document selection, quieter folder texture and a subtle cover sheen.
- Refined navigation glass and logo glow, process-image reveals, smooth disclosure expansion, section-title contrast, hero-summary layout and Apparel controls. Reduced-motion and static fallbacks remain available; CRT is excluded.
- Synced the existing server-backed reservation and customer-confirmation implementation. This UI update does not change runtime secrets, inventory, database schema or reservation deadlines. Requests do not collect payment; email confirmations require a configured verified sender.
- Local validation passed the four-page reference verifier, syntax checks for all 18 authored frontend JavaScript files, and the Worker build/package checks. Publication is a separate hosting operation.
