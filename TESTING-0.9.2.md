# MPMB Character Sheet 0.9.2 tester pass

This build intentionally combines several late-0.9 readiness changes so external testers can spend their time finding real workflow/rules defects rather than testing tiny sequential feature builds.

## Please try to break
- New characters at levels 1, 3, 5, 10, and 20.
- Multiclass characters, subclasses, races/subraces/variants, backgrounds, feats, racial ability choices, skills/tools/languages, equipment, magic items, and spellcasting.
- Reborn and other flexible-ability races; manual Racial and Other ability adjustments.
- Level up, short/long rest, HP editing, resources, spell-slot pips, prepared spells, and save/load.
- Resize the desktop window very narrow and use the sheet on a phone/tablet browser if available.
- Browser offline test: load the app once while online, reload once, then disconnect and reload. (Packaged Tauri builds are local/offline by design.)
- Print preview is experimental and is NOT considered finished in this tester pass.

## When something breaks
Use **Tester Report** in the top toolbar immediately after reproducing it. Send the resulting `.tester-report.json` together with:
1. What you were trying to do.
2. What you expected.
3. What happened instead.
4. Exact clicks/choices that reproduce it, if known.

Tester Report includes the current character because character state is often necessary to reproduce rules bugs. Review it before sharing if the character contains notes you consider private.
