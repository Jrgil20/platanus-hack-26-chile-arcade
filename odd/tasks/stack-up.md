# STACK UP — implementation plan

Objective: a top-down tactical room-clearing arcade shooter for the Platanus Hack 26 arcade
challenge, in one `game.js` (Phaser 3.87, at most 50 KB minified, no assets).
Branch: `dev` (from `main`). Delivery: `single-pr`. Target: ships 14–15 November 2026 (hard
deadline 18 November, 23:59 Santiago). Test runner: none exists for this repo; checks are the scripts in `## Checks`.
Status: first full build written and script-checked; not yet played. Brief: `design/game-brief.md`.

## Specs

Text in quotes is the author's, verbatim. Everything marked *(assumption)* was proposed by
Claude and is not confirmed point by point.

- **S1 — Genre and feel.** "mi idea nace un poco de dead ops arcade"; "juegos tacticos como
  rainbow six donde usas habilidades y otros como despejar habitaciones tacticamente";
  "entrar rapido y sorprender pero siempre tectico"; "algo tactico pero que no deje de ser
  idsparos y accion". Not an information game: "r6 es muy tactico y un juego de infromacion
  eso es mas en pro league".
- **S2 — Horde on discovery.** "me gusta mas un poco mas hacia asalto tactico , la horda es si
  te descubren". *(assumption)* Discovery = one radio carrier per room finishes a visible call
  (about 1.5 s) after seeing you; then the alarm sounds, a horde enters from the floor entrance
  and the rooms still closed are alerted (no surprise in them).
- **S3 — Enemies.** "contra un equipo tactico o una banda de mafia o algo por el estilo".
  *(assumption)* Working pick: a mafia crew; the radio carrier is its lookout.
- **S4 — Grenades.** "algo mas como flash, contusion y asi, fragmentaciont abmien tienes que
  lanzarlo bien o te pueden afectar". *(assumption)* One system, three rows of numbers; the
  grenade bounces off walls and affects everyone in its radius, the player included; one type
  carried, limited count per floor; the first playable build ships one type.
- **S5 — Controls.** The door kick is "automatica" and "el juego debe ser bien fluido".
  Two buttons: `P1_1` shoots, `P1_2` throws the grenade, `START1` starts. *(assumption)*
  Holding `P1_1` locks the aim so you can strafe.
- **S6 — Difficulty.** "debe haber una dificulta algo real que si te maten pues pero eso con
  poco codigo". *(assumption)* Difficulty is numbers only: enemy reaction time, enemies per
  room, bullet speed, all per floor; three hits, one back per cleared floor; walls stop bullets.
- **S7 — Constraints.** "el no tener assets y el codigo minimo nos restringe un poco tenlo en
  cuenta". From `AGENTS.md` and the challenge rules: `game.js` at most 50 KB minified; no
  `import`/`require`, no URLs, no network; no image or audio files; input only through cabinet
  codes; `CABINET_KEYS` kept exactly as the starter has it; storage only through
  `window.platanusArcadeStorage`; `metadata.json` with `game_name`, `description`,
  `player_mode`; `cover.png` exactly 800x600 and at most 500 KB.
- **S8 — Arcade loop.** *(assumption)* Title with best score, play that gets harder, game over,
  back to the title with one press. Score: rooms cleared, kills during surprise multiplied, a
  per-floor bonus that shrinks with time. Best score persisted.

### Decision taken without an answer

**What triggers surprise now that the kick is free and automatic?** Proposal *(assumption)*:
the first time a hostile room's door is kicked, its enemies cannot fire for a short window
(`surpriseMs`) and the game runs in slow motion for a moment; a flash or concussion grenade
extends the stun. An alerted room gives no window. The author did not answer this; the build
uses the proposal. To make only grenades surprise, set `TUNE.surpriseMs` to 0.

## Design

Decisions that the tasks depend on. Sizes are fixed from the 800x600 screen.

1. **Map is a tile grid.** Tile 20 px, so 40 x 30 tiles. The top 2 rows (40 px) are the HUD.
   The floor uses 40 x 27 tiles: 3 x 2 rooms, each 12 x 12 tiles inside (240 x 240 px), with
   one-tile walls between them and around them. One room is the empty entry room; the other
   five are hostile. One `Uint8Array` holds the tile kinds: floor, wall, closed door, open
   door. Everything below reads this one array. *(assumption: 3 x 2; 3 x 3 gives rooms of
   240 x 160 px, which looks too cramped for grenade bounces. Judged at the T1 playtest.)*
2. **No physics engine.** Movement, wall collision, bullets and grenade bounces are done by
   hand against the tile grid (move one axis at a time and test the tiles under the body).
   Reason: slow motion, stuns and fuses then run on one clock, and the pasted document's
   `physics.world.timeScale` claim could not be verified in `docs/phaser-api.md`.
3. **One clock.** `update` computes `dt * timeScale` once and every timer (reaction, radio
   call, fuse, stun, surprise, slow motion) counts down on it. No Phaser timers or tweens for
   gameplay; tweens only for cosmetic effects.
4. **Line of sight.** A ray stepped across the grid from enemy to player; a wall or closed door
   blocks it. Used for "the enemy sees you", which starts its reaction timer.
5. **Horde routing.** One breadth-first flood over the grid from the player's tile, redone a
   few times per second, gives every tile its distance to the player. Each chaser steps to the
   neighbour tile with the smaller distance. Closed doors count as walls, so the horde follows
   the doors the player opened and never sticks on a wall.
6. **Entities are plain objects in arrays** (`enemies`, `bullets`, `grenades`), each with a
   Phaser image for drawing. Enemy kinds differ by a row in `TUNE`, not by classes.
7. **Fog.** One dark rectangle per room, removed when the room is first entered.
8. **Drawing and sound.** Textures from `make.graphics()` + `generateTexture`; sound from the
   template's `tone()`; text in `monospace`. Every gameplay number lives in `TUNE`.
9. **Structure.** Taken from the arcade skill's template (`held`/`take`/`flush`, `getStorage`,
   `TUNE`, `tone`, `makeTextures`, `Title` and `Play` scenes). The `CABINET_KEYS` block is the
   starter's, byte for byte (the template's has the same keys in a different layout).
10. **Size is measured, never estimated.** No per-system byte figure is trusted until the
    checker has minified the file. Reference point: the official starter is a complete
    two-player game in 1725 lines and 47 908 raw bytes; its minified size is not measured yet.

## Checks

Run after every task. None of them plays the game: play is checked by the author.

| Check | Command | Needs |
|---|---|---|
| Official restrictions and size | `npm run check-restrictions` | `npm install` (not run yet) |
| Skill check (patterns, keys, metadata, cover) | `bash Arcade-Challenge-Studio/.claude/skills/arcade/scripts/arcade-check.sh .` | node; `esbuild` for the size row (absent until `npm install`) |
| Loads without errors, title screenshot | `bash Arcade-Challenge-Studio/.claude/skills/arcade/scripts/cover-shot.sh . <out.png>` | Chrome (present) |
| Play | the author runs `npm run dev` and plays | the author |

Test-first exception: the repo has no test runner and the rules allow only `game.js`,
`metadata.json` and `cover.png`, so there is no runnable RED. Each task is closed by the
script checks plus the named thing the author must feel in play.

## Tasks

Two days: 14 and 15 November. The game is submittable after every task.

- [x] **T0 — Baseline.** (S7) inline. `npm install` done; the official checker gives the
  starter 27.83 KB minified of 50, so size is not the constraint.
- [x] **T1 — The whole loop, first pass.** (S1–S8) inline, 14 November. One `game.js`: title
  with grenade pick, a floor of six rooms, automatic kick with surprise and slow motion,
  gunmen, lookout call, alarm and horde, three grenade types, score, best score, harder
  floors, game over and retry; `metadata.json`; `cover.png`. Official size 18.72 KB.
  Scripted runs with no uncaught error: title, play, kick, grenade, alarm, death and retry,
  floor clear into floor 2. **Not checked: how it feels. Nobody has played it.**
- [x] **T2a — First play session, first fixes.** (S1, S4, S5) inline, 15 November. From the
  author's notes in L8: aim assist with a laser sight and target ring; grenades drawn per type,
  thrown in an arc with a shadow, with a landing marker and blast ring before the throw;
  smaller blast radii and shorter self-blind; brighter look (glowing characters, lit and
  cleared rooms, crates, light flares, bodies on the floor, alarm border, monitor overlay).
  Official size 22.83 KB. Scripted runs clean for all three grenades. **Not played yet.**
- [ ] **T2 — The author plays; tuning round.** (S1, S5, S6) inline, 14–15 November. The author
  runs `npm run dev` and says what feels wrong; fixes are numbers in `TUNE` first, code second.
- [ ] **T3 — Juice and sound pass.** (S1) inline, 15 November. Only what the play session asks for.
- [ ] **T4 — Submit.** The author presses Submit in the dev UI, 15 November.

## Risks

- **Size.** Unknown until T0. Mitigation: measure after every task, cut in the order above.
- **Feel cannot be checked by a script.** Only the author's play closes T1–T4; a late playtest
  pushes everything after it.
- **Room scale.** If 240 x 240 feels wrong at T1, the grid constants change before T2, which
  is why T1 is built at final scale.
- **Hand-written collision** has edge cases (corners, fast bullets). Mitigation: bullets move
  in sub-steps no longer than half a tile.
- **`cover-shot.sh` loads Phaser in a page;** whether that page needs the network was not checked.

## Log

- L1 (2026-11-14, original request, verbatim): "vamos a trabajar en la idea esta es la que
  tengo por ahora:" followed by a pasted "ZERO DAY BREACH" document from another AI, which the
  author then set aside ("lo demas fue proporcionada por una ia que no entiende el concepto").
- L2 (2026-11-14): "como vas a a arrancar sin un plan de implemeentacion detallado apenas
  tenemos la ideas" — this plan was written in answer; no game code exists.
- L3 (2026-11-14, evidence): starter `game.js` is a two-player brick duel, 1725 lines,
  47 908 raw bytes. Skill template is 133 lines, 6 445 bytes. `CABINET_KEYS` in template and
  starter hold the same keys, formatted differently. `timeScale` does not appear in
  `docs/phaser-api.md`. `node_modules` is absent, `esbuild` is not installed, Chrome is.
- L4 (2026-11-14): `AGENTS.md` allows edits to three files only; `design/game-brief.md` and
  this document exist because the author asked for the idea and the plan in markdown.
- L5 (2026-11-14): "ese plan es demasiado larog esto sale entre hoy y manana, haced el npm
  instal de lo quenecesites" — plan cut to two days; `npm install` run by Claude.
- L6 (2026-11-14, evidence): official checker on the new `game.js`: 29.04 KB raw, 18.72 KB
  minified, all restrictions pass. `CABINET_KEYS` block identical to the starter's (diff clean).
  `cover.png` 800x600, 56 647 bytes. Scripted scenarios run in headless Chrome by stepping the
  scene's `update` directly (harness kept outside the repo): door kick wakes the room with slow
  motion; standing still in a doorway costs two hits in about four seconds and the lookout
  raises the alarm; eight thugs enter on floor 1; killing everything clears the floor, adds the
  silent bonus and builds floor 2; three hits end the run and one press starts a new one.
- L7 (2026-11-14): three grenade types and the title pick were built in T1 instead of last,
  because the measured size left 31 KB free.
- L8 (2026-11-15, the author after playing, verbatim): "tenemos espacio, no se ve bien lo que
  es una granada y demas, ademas es dificil apuntar,  pero puedo matar al de la alarma y luego
  esperar en otra habitacion eso me gusta bastamte veo que tenemos un poco de espacio casi la
  mitad eso me gusta da la posibilidad de trabajar en varias cosas pero creo que deberia sera un
  poco mas visual no llama mucho la atencion , casi siempre me ciego con la flash , creo que el
  radio es demasiado grande". Keep: killing the lookout and then waiting in another room.
- L9 (2026-11-15, evidence): blast radii 115/100/85 changed to 80/75/70, self-blind 1600 ms to
  900 ms. Scripted: a flash landing 166 px away does not blind the player; one thrown at a wall
  60 px away does; a concussion at 60 px shoves the player; a frag at 60 px costs one hit. Aim
  assist turned a shot 0.10 rad onto an enemy and killed it. Official checker 22.83 KB minified,
  all restrictions pass; `CABINET_KEYS` block identical to the starter's; cover 800x600, 192 KB.
