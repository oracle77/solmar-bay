[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/oracle77/solmar-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/oracle77/solmar-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Bay

A top-down 2D open-world crime game that runs entirely offline in a desktop
browser. Sun-soaked coastal city, traffic and pedestrians, cars to steal,
police who chase you when the heat is on, three story missions, combat, a
live minimap, a day/night clock, synthesized sound, and a save that survives
closing the tab. Everything — the city, the characters, the story, the art
and the sounds — is original.

## The story

Marco came home to Solmar Bay with nothing but a name and a grudge. The
city runs on stolen cars, dropped packages and police heat, and Marco is
about to work his way through all three.

## How to play

Serve `game/` with any static server (or run `node serve.ts`) and open
`http://localhost:8080`.

| Key | Action |
| --- | --- |
| WASD / Arrows | Walk, and drive when in a car |
| Shift | Run |
| Mouse | Aim the pistol |
| Click | Shoot (12 rounds, auto-reload) |
| F | Punch |
| E | Steal a car / step out |
| P or Esc | Pause (and save) |
| M | Mute |
| Space | Start, confirm, retry |
| C | Continue a saved game (title screen) |

## Missions

1. **Hot Wheels — $500.** Steal any car and bring it to the yellow garage
   marker. Steal it in front of a witness and the police take notice.
2. **The Drop — $800.** Pick up the package at the gold marker, then drive
   it to the blue docks.
3. **Heat Wave — $1,200.** You start at 3 stars. Break line of sight and
   stay hidden until the heat cools to nothing.

Cash is scattered around the city too. Finish all three missions and the
story-complete screen is yours.

## The wanted system

Shooting adds a star, killing adds two, and stealing a car in front of a
witness adds one. Police cruisers chase, ram, and at 3 stars or more shoot
back. Get caught slow or on foot and you are busted; lose all your health
and you are wasted. Break line of sight for a while and the stars cool off
one at a time.

## The city

A seeded grid city, 3200 × 2400 pixels, so `?seed=N` always grows the same
streets, buildings, park, beach and hotel strip. Roads run every 400 px,
traffic cruises them and stops for the car ahead, pedestrians walk the
sidewalks and flee gunfire and speeding cars. The clock runs a full
day/night cycle, and the light changes with it.

## Files

- `game/index.html` — the page, a 1280 × 720 canvas
- `game/src/config.js` — tuning numbers and the palette
- `game/src/random.js` — the seeded random generator
- `game/src/world.js` — the city, the simulation, missions, wanted logic, saving
- `game/src/render.js` — the top-down renderer, HUD, minimap and screens
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — WebAudio synthesized sound, no audio files
- `game/src/shots.js` — the four staged screenshot scenes and the autopilot
- `game/src/main.js` — boot, the fixed-step loop and screen flow
- `main.ts` — the entry program: copies the game and screenshots and writes
  `dossier.json`
- `serve.ts` — a tiny static server for local play
- `shots.json` — the four screenshot scenes

## Screenshots

The four scenes in `screenshots/` are real renders of the game itself:
the title over the living city, stealing a car for the first mission, a
three-star chase, and the story-complete screen at dusk.

<sub>Entered on [make.fun](https://make.fun/?ref=5n6bz897&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
