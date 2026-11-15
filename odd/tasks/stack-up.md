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
- [x] **T2b — Improvement plan M1–M6 built.** inline, 15 November, on "perfecto implementa
  esos 11kb". Score table with initials and run summary; pickups; heavy enemy, six cover
  layouts, three floor palettes; hostages; noise-based sound and a bass line; two-player
  co-op (`player_mode` now `two_player`). Real cost 7.46 KB against the 10.7 KB guessed.
  **Not played yet; M7 (final pass) waits for the author's session.**
- [ ] **T2 — The author plays; tuning round.** (S1, S5, S6) inline, 14–15 November. The author
  runs `npm run dev` and says what feels wrong; fixes are numbers in `TUNE` first, code second.
- [ ] **T3 — Juice and sound pass.** (S1) inline, 15 November. Only what the play session asks for.
- [ ] **T4 — Submit.** The author presses Submit in the dev UI, 15 November.

## Improvement plan (15 November)

Asked for by the author: "crea un plan de mejora detalaldo", after "mejor mucho mejor, aun nos
queda unos 20kb para meorar". Every item below is a proposal by Claude *(assumption)* until the
author picks it. Nothing here is built.

**Budget.** Official size now 23.03 KB of 50. Keep 5 KB of headroom, so about 22 KB to spend.
The KB figure on each item is a rough guess to order the work, not a measurement; the official
checker is run after every item and the ledger below is corrected with the real number.

**Rules for every item.** One item at a time, in this order; the game stays submittable after
each; each ends with: official checker, key block diff, a scripted run with no uncaught error,
then the author plays and says keep, change or drop. Numbers go in `TUNE`.

| # | Item | Why | Guess |
|---|---|---|---|
| M1 | Score table with initials, run summary | An arcade cabinet lives on the score table | 1.8 KB |
| M2 | Pickups when a room is cleared | The Dead Ops part: a reward to grab, a reason to push on | 1.2 KB |
| M3 | A third kind of enemy and varied rooms | Every room plays the same today | 2.0 KB |
| M4 | Hostages | Makes the grenade choice tactical: flash is safe, frag is not | 1.2 KB |
| M5 | Sound: noise shots and blasts, a bass line that speeds up on alarm | It is silent between shots; a cabinet needs presence | 1.5 KB |
| M6 | Two-player co-op | Biggest draw on a two-stick cabinet; biggest risk | 3.0 KB |
| M7 | Final pass: cover, texts, tuning from play | Ship | 0.5 KB |

Total guessed: about 11 KB, half of what is free.

### M1 — Score table with initials, run summary
- Top 5 saved through the storage bridge as `[{ n, s, f }]` (initials, score, floor); every entry
  validated on read (three letters, finite numbers), anything else dropped.
- On game over with a top-5 score: pick three initials with the stick (up/down letter, right
  next, `P1_1` confirm). Otherwise straight to the summary.
- Summary on the game-over screen: floor reached, rooms cleared, silent floors, best multiplier.
- Title shows the table instead of the single best score.
- Check: scripted run writes a score, restarts and reads it back; a corrupted stored value does not crash.
- The author judges: is entering initials quick enough to not break "one press and play again"?

### M2 — Pickups when a room is cleared
- Clearing a room drops one pickup in its centre for a few seconds: grenade (+1), armour (+1
  hit, never above the maximum), or shotgun (five-pellet spread for a short time).
- A surprised clear (every kill inside the surprise window) guarantees the better drops.
- One table of rows `{ name, colour, weight, effect }`; drawn in code with its own glow.
- Check: scripted clear spawns a pickup; walking over it applies the effect; it expires.
- The author judges: do the drops pull you forward, or make the game too easy?

### M3 — A third kind of enemy and varied rooms
- Heavy: slow, takes three hits, fires a three-shot burst; at most one per room, from floor 2.
- Five cover layouts instead of two random crate stacks: a centre block, a wall of crates with a
  gap, corner stacks, a long table, scattered pillars. All keep doors and spawns clear.
- A colour palette per floor (three palettes cycling) so a new floor looks new.
- Check: scripted build of 50 floors: every room reachable, no enemy inside cover, no blocked door.
- The author judges: do rooms now ask for different entries?

### M4 — Hostages
- From floor 2, some rooms hold one hostage (green, hands up, does not move).
- Shooting or fragging a hostage costs score and resets the multiplier; flash and concussion do
  not hurt them. Clearing the room with the hostage alive pays a bonus.
- The aim assist never targets a hostage.
- Check: scripted frag in a hostage room applies the penalty; flash does not.
- The author judges: does it make you think before throwing, without slowing the game down?

### M5 — Sound
- One shared noise buffer for gunshots, explosions and door kicks (filtered bursts), kept
  alongside the existing tones.
- A four-note bass line on a timer: slow while unseen, fast and higher once the alarm is up,
  silent on the title.
- Check: no uncaught error with the audio context suspended (the cabinet may start it late).
- The author judges: volume balance on real speakers; nothing a script can tell.

### M6 — Two-player co-op (needs the author's decision first)
- `START2` joins at any time; player 2 uses `P2_*` with the same two buttons.
- Enemies target the nearest living player; the horde routes to the nearest; a downed player
  comes back when the floor is cleared; the run ends when both are down.
- `metadata.json` `player_mode` becomes `two_player`.
- Cost and risk: every place that reads `this.p` changes; balance for two has to be played by
  two people before the deadline. If it is not solid by the last day, it is dropped, not shipped half done.
- Check: scripted run with both players: join, one down, floor clear revives, both down ends.

### M7 — Final pass
- Regenerate `cover.png`, review `metadata.json`, tune `TUNE` from the author's last session,
  full scripted run, official checker, then the author presses Submit.

### Ledger
| After | Official size | Free |
|---|---|---|
| Now (e27dcce) | 23.03 KB | 26.97 KB |
| M1–M6 built in one pass (15 Nov) | 30.49 KB | 19.51 KB |
| Quiet entry (15 Nov) | 32.14 KB | 17.86 KB |
| Door that opens gradually (15 Nov) | 33.32 KB | 16.68 KB |
| Spanish text, view cones, takedown, how-to screen (15 Nov) | 36.25 KB | 13.75 KB |

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
- L10 (2026-11-15, the author after the second session): "mejor mucho mejor, aun nos queda unos
  20kb para meorar y el rango de auto aim es muy grande debe ser mas como un trangulo y mas
  corto". Done in e27dcce: assist 0.6 -> 0.3 rad each side, new 170 px range, triangle drawn on
  the floor, laser 330 -> 240 px; official size 23.03 KB. Not run in a browser, only syntax and
  the official checker.
- L11 (2026-11-15): "crea un plan de mejora detalaldo" — the Improvement plan section above.
- L12 (2026-11-15): "perfecto implementa esos 11kb" — taken as approval of M1–M7, co-op
  included, since the 11 KB total counted it.
- L13 (2026-11-15, evidence, one scripted run in headless Chrome, no uncaught error): 60
  generated floors, 1601 enemies, none inside cover or unreachable, no blocked door, every room
  with 100+ free tiles; player 2 joins with START2; a downed player returns on the next floor
  with one hit; clearing rooms drops pickups and a grenade pickup raises the count 3 -> 4; three
  hostages saved on a cleared floor; a flash on a hostage costs nothing, a frag costs 500;
  initials entered with the stick are saved and read back from storage. Official checker
  30.49 KB, all restrictions pass; `CABINET_KEYS` block identical to the starter's; cover
  regenerated. Not checked by any script: balance for two players, sound levels, feel.
- L14 (2026-11-15): differences from the written plan: each player carries a different grenade
  (player 2 gets the next type after player 1's pick); the horde is 1.5x in co-op; grenades cap
  at 5; in both hands of a scripted 2.4 s firefight no enemy died, because the aim assist now
  only reaches 170 px — expected after the author's request, to be judged in play.
- L15 (2026-11-15, the author on the aim assist): "sigo viendo el aim demasiado grande", then
  "demasiado frande ese auto aim deve ser el tieangulo minimo  unos 2 o 3 grados". Now
  `assist` 0.05 rad each side, `assistRange` 110, `laser` 150. "ahora si, mergealo a main":
  main fast-forwarded to d16aa7a and pushed.
- L16 (2026-11-15): "demasiado grande ese circulo que veo al princionio no se ni que es" — the
  blast ring drawn before a throw was removed; a small cross marks the landing spot (8803497).
- L17 (2026-11-15, new requirement, verbatim): "me encantaria dos tipos de entrada quedan
  botones por asignar una entrada tipo tactica si estas al lado de la puerta la puedas activar
  por un boton y sea como un despeje de habitacion onde se va abriendo segun el rango de vision
  y un triangulo que se va abriendo como en un despeje tectico  que se va abriendo de forma qeu
  vaya viendo la habitacion".
  **S9 — Two entries.** The kick stays (walk into the door: loud, whole room surprised, slow
  motion). New quiet entry on button 3 (`P1_3` / `P2_3`) when standing by a closed door
  (`doorReach` 46 px): the door opens silently and the room stays dark; it is revealed tile by
  tile by line of sight from the players, so the lit area is the wedge seen through the door
  and widens as you move. *(assumptions)* Each enemy stays unaware until a clear line reaches a
  player, then is frozen for `peekMs` 600 ms (kills in it count as surprise); tiles looked at
  before stay dimmed; an alarm or a grenade blast ends unawareness; no slow motion.
- L18 (2026-11-15, evidence, one scripted run): beside the door the prompt shows; button 3
  opens it, the room is awake-quiet with 3 of 3 enemies unaware and hidden and 7 tiles seen
  from the side; in front of the door 72 tiles seen and all three spotted and frozen; one step
  inside 125 tiles. No uncaught error. Official size 32.14 KB. Not played.
- L19 (2026-11-15): "haced los cambios" was misread as "merge to main" (main fast-forwarded to
  18c3e58); the author meant the quiet entry, which he took for a proposal. Correction, verbatim:
  "mejro un poco mas el auto aim, y el abrir silencioso se supone que abre mientras se va viendo
  una abertura tactica".
  **S9 rewritten.** The quiet door does not snap open: it swings open over `creakMs` 1600 ms
  from the side the player stands on (tile 6, passable only to sight and shots through the gap
  so far), and the view into the room widens with the gap; a triangle from the player through
  the gap edges is drawn while he stands near the door. The player cannot walk through until it
  is fully open. Aim assist raised to `assist` 0.1 rad each side, `assistRange` 130.
- L20 (2026-11-15, evidence, two scripted runs, no uncaught error): after the press the door
  tiles are 6; opening 0.27 at 400 ms with 25–36 room tiles seen, 0.53 at 800 ms with 62, fully
  open (tiles 3) by 2000 ms with 77; pushing into the half-open door moves the player only up
  to it (12 px), walking through once open moves him 74 px; enemies are spotted one by one as
  the gap grows. Official size 33.32 KB. Not played.
- L21 (2026-11-15): the author asked what else could improve the game; Claude proposed five
  items and recommended view cones with a silent takedown plus a how-to screen. Answer,
  verbatim: "termina de afinarlo ademas casi todos los que lo usaran es en espanol cambia eso".
  Taken as: build the two recommended items and put all on-screen text in Spanish.
  **S10 — Spanish.** Every on-screen string is in neutral Spanish; code and comments stay in English.
  **S11 — Stealth** *(assumptions)*: an unaware enemy looks from side to side and notices a
  player only inside his cone (`fov` 0.7 rad each side, `coneR` 170 px, clear line needed); he
  is shown, with his cone on the floor, only while a player has him in view; button 3 within
  `takeR` 32 px takes him down silently and counts as a surprise kill; a player's shot wakes the
  unaware within `hearR` 230 px, a blast within 1.3 times that.
  **S12 — How-to screen** between the title and the game: kick, stealth, the lookout.
  Not built from the proposal: boss floor, reinforced doors, extra impact effects.
- L22 (2026-11-15, evidence, two scripted runs, no uncaught error): title -> how-to -> game;
  door opened quietly, 4 of 4 unaware; standing 24 px behind one for 20 frames leaves him
  unaware and shows "B3: DERRIBAR"; button 3 removes him, multiplier 1 -> 2, the rest stay
  unaware; at another one's side, 40 px away with a clear line, he stays unaware; two others
  noticed the player without any shot fired; 200 ms of fire wakes the remaining one. The test
  found no clear spot in front of the chosen enemy (he faced a wall), so "seen from the front"
  is shown only indirectly. Official size 36.25 KB; cover regenerated in Spanish. Not played.
