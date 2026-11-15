# Game Brief: STACK UP *(provisional)*

<!-- Marks: unmarked = the author said it. *(guessed)* = proposed by Claude, not yet confirmed.
     *(provisional)* = working choice, expected to change. -->

## In your words

> vamos a trabajar en la idea esta es la que tengo por ahora: *(followed by a pasted
> "ZERO DAY BREACH" document written by another AI; see the note below)*

> realmente mi idea nace un poco de dead ops arcade,los egg easter de cod black ops asi que
> de alli aprto lo demas fue proporcionada por una ia que no entiende el concepto que
> propones , y bueno parte de la idea tambien es los juegos tacticos como rainbow six donde
> usas habilidades y otros como despejar habitaciones tacticamente

> me interesa mas lo de asalto y alarma rainbow y jeugos de despeje es o entrar rapido y
> sorprender pero siempre tectico pues, osea algo tactico pero que no deje de ser idsparos y
> accion si bien r6 es muy tactico y un juego de infromacion eso es mas en pro league

> me gusta mas un poco mas hacia asalto tactico , la horda es si te descubren asi que bien
> por eso

> creo que lo ideal es contra un equipo tactico o una banda de mafia o algo por el estilo

> algo mas como flash, contusion y asi, fragmentaciont abmien tienes que lanzarlo bien o te
> pueden afectar, ademas el no tener assets y el codigo minimo nos restringe un poco tenlo en
> cuenta

> automatica el juego debe ser bien fluido, ademas debe haber una dificulta algo real que si
> te maten pues pero eso con poco codigo

Note: the pasted "ZERO DAY BREACH" document (antivirus inside a server, 3 buttons, dual-stick,
co-op, three power-ups, boss) is not the author's idea. Only the pieces listed below were kept.

**Pitch:** Kick the door, surprise the room, clear it before anyone calls for backup — a
top-down tactical assault that never stops being a shooter.

**Genre:** top-down tactical room-clearing arcade shooter

**Controls:** two buttons. Joystick moves in 8 directions; `P1_1` shoots and locks the aim
while held (strafe) *(guessed)*; `P1_2` throws the grenade; `START1` starts. The door kick is
automatic: walk into a door and it bursts open. The game must feel fluid.

**Question:** Does breaching a room with surprise feel good enough to want the next door?

**Hooks:**
- Bursting through a door surprises the room: a short window of stunned enemies and slow
  motion, and kills inside that window multiply the score. A grenade extends it. *(guessed;
  what exactly triggers surprise is the open decision in `odd/tasks/stack-up.md`)*
- The horde only comes if you are discovered.

**Intent:** *(empty)*

## Look and references

- Look: tactical floor plan seen from above; dark background, walls as light lines, enemies
  and shots in neon; unexplored rooms covered in dark fog. All drawn in code, no image files.
  *(guessed)*
- Setting: you are a tactical operator raiding a building held by an armed gang — a mafia
  crew or a rival tactical team. Working pick: a mafia crew *(provisional)*, because it explains
  the horde: the radio carrier is the lookout, and the horde is the crew's backup arriving.
- References: Dead Ops Arcade (top-down arcade shooting, score, horde pressure); Rainbow Six
  (abilities, fast surprising entries, clearing rooms).
- View: 2D · Camera: fixed top-down, the whole floor visible on one 800x600 screen. *(guessed)*

## First minute

You start in a corridor outside a dark room. You walk to a door and kick it in: the fog
lifts, the enemies inside freeze for a second in slow motion, and you shoot the one carrying
the radio first, then the rest. The room is clear and the score multiplier pops. You line up
on the next door. *(guessed)*

## Challenge

The first real trouble is the first radio call you fail to stop, likely in the second or third
room: the alarm sounds, a horde pours in from the floor entrance and the rooms still left are
alerted, so there is no surprise to gain in them. You take three hits and the run is over.
Later floors have more enemies per room. *(guessed)*

## Difficulty

Real difficulty: the game must actually kill you, and it must cost little code. So difficulty
is a handful of numbers, not new behaviours *(guessed)*:

- Reaction time: how long a shooter takes to fire after seeing you. Short enough that walking
  into a room without surprise usually costs a hit. It shrinks on each floor.
- Enemies per room and bullet speed, both rising per floor.
- Three hits, no healing during a floor; one hit back when a floor is cleared.
- Walls block bullets, so cover and angles are how you survive.
- Fluid: no reload, no menus, one press from game over back into a run.

## Core loop

- Pick a door and burst in to surprise the room, with a grenade when it is worth one.
- Kill the radio carrier first, then clear the room, scoring more for kills during the surprise.
- If the call goes through, survive the horde.
- Clear every room to move to the next, harder floor.

## Goal & fail state

- Goal: the highest score — rooms cleared, kills during surprise, and a per-floor bonus that
  shrinks the longer you take. *(guessed)*
- Fail: three hits end the run; back to the title with the best score saved. *(guessed)*

## Features

- [ ] 8-direction movement and shooting with aim lock
- [ ] Automatic door kick that surprises the room (stun and slow motion)
- [ ] One grenade type, thrown with `P1_2`, that also affects you *(guessed: which type first)*
- [ ] A floor of closed rooms, each hidden by fog until entered, and floors that get harder *(guessed)*
- [ ] Enemies: shooters and one radio carrier per room *(guessed)*
- [ ] Discovery: an unstopped radio call triggers the alarm, the horde and alerted rooms *(guessed)*
- [ ] Score with surprise multiplier, shrinking floor bonus and saved best score *(guessed)*

## Grenades

Abilities are thrown grenades: flash, concussion and fragmentation. A bad throw affects you too.

One system, three rows of numbers *(guessed)*: a grenade flies in the aim direction, bounces
off walls, goes off after a short fuse and affects everyone in its radius, the player included.

| Grenade | On enemies | On you |
|---|---|---|
| Flash | long stun, no damage, wide radius | the screen goes white for a moment |
| Concussion | short stun, knockback, blows doors open | knocked back and slowed |
| Fragmentation | kills in the radius | you lose a hit |

- Limited count per floor. *(guessed)*
- You carry one type, picked on the title screen. *(guessed)*
- The door kick has no button: doors burst open when walked into.

## Your systems

- habilidades (abilities) · thin stand-in *(guessed)* — grenades; one type in the first build
- despejar habitaciones (room clearing) · in the slice
- horda si te descubren (horde on discovery) · in the slice

## Keep

-

## Avoid

- Not an information game: "r6 es muy tactico y un juego de infromacion eso es mas en pro league".
- Tactical, but it must never stop being shooting and action.
- The antivirus-in-a-server theme from the pasted document. *(inferred (strong))*

## Out of scope

- The second and third grenade types — after the first build, if the 50 KB budget allows.
  The first build ships one grenade. *(guessed)*
- Shield operator (dropped in favour of grenades). *(guessed)*
- Two-player co-op and dual-stick aiming.
- A third button (EMP grenade).
- Boss, extra weapons and power-ups, destructible furniture, dynamic music.
- Hard countdown timer (replaced by the shrinking floor bonus). *(guessed)*

## Build order

1. Surprise entry: one room, the automatic kick, stun and slow motion, shooters that fight
   back, three hits to lose. This is the risky part; if it does not feel good, nothing else matters.
2. The radio carrier, the alarm, the horde and the first grenade.
3. A full floor of rooms with fog, score and saved best score.
4. Harder floors.
5. Sound, effects and cover.
6. The other two grenade types, only if bytes remain.

The detailed plan, with checks and dates, is `odd/tasks/stack-up.md`.

---
**Kill condition:** if the door kick still feels flat after two rounds of tuning. *(guessed)*

**Who it's for / what they feel:** arcade players who want to feel like a breach team: fast,
sharp, in control until it goes loud. *(guessed)*

**Games you love / don't:** Love Dead Ops Arcade (where the idea was born) and Rainbow Six
(abilities, fast surprising room entries); don't want the slow pro-league information game.

**Constraints:** Platanus Hack 26 arcade challenge — Phaser 3, a single `game.js` of at most
50 KB minified, no external assets, cabinet controls, deadline 18 November 2026, 23:59 Santiago.
