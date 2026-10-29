# Teraphobia PRD

Guilherme Oliveira, Oct 29, 2026

## Overview

Teraphobia is a Halloween social deduction party game for 4 to 8 players in one room: a web app runs the game on a shared screen, and each player uses an iOS app as their controller. One player is secretly a Monster who kills at night; the Villagers gather private clues about the Monster's costume by day and vote to banish a suspect.

**Goals**

- Ship a playable v1 that meets every rubric item for the UCF MERN group project, which will be demoed live.
- Keep the game unsolved: no fixed sequence of moves guarantees a win for either side.
- Keep rounds short (about 2.5 minutes at default timers) and easy to learn in one game.

**Success criteria**

- A full game runs end to end with 4 and with 8 players, on the deployed site, with no server restarts.
- Balance simulation shows each side winning 40% to 60% of games at every player count from 4 to 8.
- Lighthouse 95+ for performance and accessibility on desktop and mobile web.
- Every REST endpoint has a unit test; every core flow has a Playwright E2E test; CI blocks merges when either fails.

**Out of scope for v1**

- Remote play, in-app chat, and voice.
- Android and an App Store release (TestFlight only).
- Public leaderboards and the extra stats listed under v2 ideas.
- Printable rules sheet and card set (after the art is final).

## Diagrams

All five diagrams live in [`diagrams/`](diagrams/), with their Mermaid source and a render script.

- [Schedule (Gantt)](diagrams/gantt.png)
- [Data model (ERD)](diagrams/erd.png)
- [Use cases](diagrams/use-case.png)
- [Game classes](diagrams/class.png)
- [One round (sequence)](diagrams/sequence-round.png)

## Players and platforms

The web app is the host and the iOS app is the controller; the professor approved this split.

| Who | Device | Account | What they do |
| --- | --- | --- | --- |
| Host | Laptop or TV browser (web app) | Required, email verified | Creates the room, picks the timer preset, kicks players before start, keeps the shared screen open |
| Guest player | iPhone (iOS app via TestFlight) | None | Enters room code + display name, plays the game |
| Signed-in player | iPhone (iOS app) | Optional, email verified | Same as a guest, plus a custom profile, saved stats, and game history |

- The host can also play by joining from their own phone like any other player; the shared screen never shows private info.
- Players install the app from a TestFlight public link. The join QR on the shared screen deep-links into the app with the room code filled in, and falls back to the install page.
- Profiles and stats are visible on both web and iOS.

## Game rules

One Monster hides among 3 to 7 Villagers; the game loops Night, Morning, Day, Discussion and Vote until the Monster is banished or only one Villager is left.

### Setup

1. 4 to 8 players join; the host presses Start (unlocked at 4 players).
2. The server deals each player a public costume: 3 slots (hat, mask, held item) with 4 options each, 64 combinations. Options differ by shape, never by color alone.
3. No two costumes are identical, and every player shares 2 of 3 traits with at least one other player, so the deal never points at the Monster.
4. The server picks one Monster at random. Type odds: Vampire 40%, Witch 40%, Werewolf 20% (Werewolf only in games of 6+ players). Everyone else is a Villager.
5. Only the Monster's phone learns the Monster type. It stays secret from everyone until the game ends.

### Monsters

| Monster | Odds | Once-per-game power | How it stays hidden |
| --- | --- | --- | --- |
| Vampire | 40% | During Day, blocks one player's action | A blocked Search shows "You found nothing", and normal Searches are also empty about 20% of the time. A blocked Candle tells its player "The Monster blocked your candle" |
| Witch | 40% | During Day, plants a fake clue in one player's Search | The fake trait looks exactly like a real Search result. If the target doesn't Search that day, the power is kept |
| Werewolf | 20%, 6+ players | At Night, kills two players; never on Night 1 | Not hidden: a double kill reveals the Werewolf (accepted) |

### The round

See [One round (sequence)](diagrams/sequence-round.png). Timers shown are the Normal preset, about 2.5 minutes per round.

1. **Night (30s).** The Monster picks a victim. Villagers privately answer "Who do you suspect?" (shown as an end-game stat; it has no effect).
2. **Morning (10s).** The shared screen reveals who died, or "Everyone survived the night" if a candle saved them. All deaths look the same.
3. **Day actions (30s).** Each living Villager picks one private action:
    - **Search the crime scene:** learn one random trait the Monster has (repeats allowed). Max 2 successful Searches per day; extra searchers are picked at random and get "You found nothing". The balance script may raise the cap to 3 at 7 to 8 players.
    - **Commune with the dead:** learn one random trait the Monster does not have (9 possible, repeats allowed). Max 2 successful per day; others get "The dead are silent". All silent if nobody died last night.
    - **Light a candle:** protect one other player from tonight's kill. Not yourself, and not the same player two nights in a row. A save is silent.
4. The Monster takes no Villager action slot. Its phone shows rotating flavor messages ("The villagers are looking for you!", "Wait for your turn to strike!") plus its power button while unused.
5. **Discussion and vote (90s: 60 talk, 30 vote).** Players talk out loud and share or lie about their clues. Each living player votes for a player or Skip on their phone. Votes are secret while open; then the shared screen shows who voted for whom. A player is banished only with more votes than any other option, Skip included. A tie banishes nobody.

### Winning

- Villagers win when the Monster is banished, or by forfeit if the Monster disconnects for 2 full rounds.
- The Monster wins when Monsters equal Villagers (one Villager left alive).
- Win is checked after each Morning reveal and after each vote. There is no round cap.
- Dead and banished players are fully out: no actions, no votes, no hidden info.

### Timing and presets

Every phase ends on its timer, never early, so tapping speed proves nothing. The host picks Quick, Normal, or Relaxed in the lobby, which scales all timers. Normal is the default above, about 2.5 minutes per round.

### Why the game is not solved

- Random costumes, Monster, Monster type, and Search results every game.
- Clues are private, so every shared clue is a claim that might be a lie.
- Daily Search and Commune caps stop the group from brute-forcing the 3 traits in one day.
- The Monster type is secret, and Witch and most Vampire powers look like normal results.
- Every costume has a lookalike, so even 2 known traits leave more than one suspect.
- Identical phone screens and timer-only phases remove physical tells.
- A balance-simulation script plays thousands of bot games per player count and targets a 40% to 60% win rate for each side.

## Functional requirements

Each requirement below becomes one or more GitHub issues; its acceptance criteria are the issue's definition of done.

### Accounts and auth

**FR-1 Register with email and password.**

- Password rules shown inline; passwords hashed with bcrypt.
- A verification email (Resend) is sent on register; the link expires after 24 hours.
- An unverified account cannot host a game or save stats.

**FR-2 Sign in with Google.**

- Google OAuth works on web and iOS.
- A Google account counts as email verified.
- Signing in with Google on an email that already has a password account links the two.

**FR-3 Password recovery and change.**

- "Forgot password" emails a single-use reset link that expires after 1 hour.
- Signed-in users can change their password after entering the current one.
- Every reset or change ends other sessions.

### Lobby

**FR-4 Create a room (host, web).**

- A verified host gets a 4-letter room code and a join QR on the shared screen.
- The host picks Quick, Normal, or Relaxed timers (default Normal).

**FR-5 Join a room (player, iOS).**

- Players join with room code + display name; no account needed.
- Display names are 1 to 16 characters and unique within the room.
- Opening the join QR on a phone with the app opens the app with the code filled in.

**FR-6 Lobby management.**

- The shared screen shows the live player list.
- The host can kick a player before Start.
- Start unlocks at 4 players; joining stops at 8.
- At Start the code closes to new players but still lets existing seats rejoin. A new phone sees "Game already started". The code is freed when the game ends.

### Gameplay

**FR-7 Deal and roles.** The server deals costumes and picks the Monster per Game rules. Each phone shows its own role privately; only the Monster's phone gets the Monster type.

**FR-8 Phase engine.** The server owns the clock and moves Night, Morning, Day, Discussion, Vote in order. Phases end only on the timer. Every client shows the same countdown within 1 second.

**FR-9 Night.** The Monster picks a victim (two for an available Werewolf power). Villagers answer "Who do you suspect?". A Monster with no pick kills nobody.

**FR-10 Day actions.** Each living Villager picks Search, Commune, or Candle, resolved at phase end with the caps and rules from Game rules. A player with no pick does nothing.

**FR-11 Monster powers.** Each power can be used once per game, only in its phase, and the button disappears after use. Blocked Searches, blocked Communes, and faked clues look the same as normal results. A blocked Candle tells its player "The Monster blocked your candle", and the candle's target is not protected that night.

**FR-12 Vote.** Living players vote for a player or Skip. A missed vote counts as Skip. The tally and who voted for whom show after the vote closes. The banish rule follows Game rules.

**FR-13 End of game.** The shared screen reveals the Monster, its type, the winner, and each player's night hunches. The result is saved to every signed-in player's history.

### Disconnects

**FR-14 Rejoin.**

- A player who drops rejoins the same seat: guests through a device rejoin token, signed-in players through their account.
- A missed phase counts as no action; a missed vote counts as Skip.
- A player gone for 2 full rounds is removed as if killed. If that player is the Monster, Villagers win by forfeit.
- If the host screen drops, the game keeps running on the server, timers pause, and they resume when the host reopens the room.

### Profiles and stats

**FR-15 Profile.** Display name, avatar from preset Villager and Monster icons, email, and sign-in method. Editable on web and iOS.

**FR-16 Stats and history.** Games played, wins as Villager, and wins as Monster by type. A history list shows date, players, Monster, and winner. Stats are private; there is no public leaderboard.

## Screens

The shared screen tells the story everyone can see; the phone shows only what that player is allowed to know. Both apps use one set of design tokens in a dark, moonlit cartoon style: navy and purple backgrounds, one orange accent, and big figures readable from across a room.

### Web (host and shared screen)

| Screen | Shows |
| --- | --- |
| Landing | What the game is, Host a game, Sign in |
| Sign in / Register | Email and password, Google, forgot password |
| Verify email / Reset password | Result of the emailed link |
| Profile and stats | Avatar, name, stats, game history, change password |
| Create room | Timer preset, Create |
| Lobby | Room code, join QR, live player list, kick, Start |
| Night | Moonlit manor, countdown, no private info |
| Morning | Who died, or "Everyone survived the night" |
| Day | Countdown, all costumes with their 3 traits, living and dead players |
| Discussion and vote | Countdown, then the vote reveal (who voted for whom) and the banish result |
| Game over | Winner, the Monster and its type, night hunches, Play again |
| Paused | Shown when the host screen reconnects mid-game |

### iOS (player controller)

| Screen | Shows |
| --- | --- |
| Join | Room code (prefilled from QR), display name, optional sign in |
| Sign in / Register / Profile | Same account features as web |
| Waiting room | Your costume preview, players joined so far |
| Role reveal | Villager, or Monster + its type; hold to peek |
| Night | Villager: "Who do you suspect?" Monster: pick a victim |
| Day | Villager: Search, Commune, or Candle, then the private result. Monster: flavor message + power button |
| Vote | Player list + Skip, then a locked-in state |
| Out | Shown to dead or banished players until the game ends |
| Game over | Win or lose, your stats update |
| Reconnecting | Shown while the socket rejoins your seat |

Every in-game phone screen has the same layout and timing for Villagers and the Monster, so a glance at someone's phone gives nothing away.

## Architecture and tech stack

One Node server owns all game state; the web host screen and the iOS controllers are thin clients that render what the server sends them. Both clients reach the server only through Nginx; MongoDB, Resend, and Google are called only by the server.

| Part | Tech | Notes |
| --- | --- | --- |
| Game server + API | Node 22, TypeScript, Express, Socket.io | REST for accounts, profiles, stats; Socket.io for rooms and live play. Live game state in memory, results written to MongoDB at game end |
| Web app | React, Vite, TypeScript | AJAX calls to the REST API; Socket.io client for the shared screen |
| iOS app | Swift, SwiftUI | Socket.io Swift client; TestFlight distribution; Xcode Cloud builds |
| Database | MongoDB Atlas free tier (512 MB) | Users, profiles, stats, game history, tokens |
| Email | Resend (free tier: 3,000/month, 100/day) | Verification and password reset |
| Auth | JWT access token + refresh token, bcrypt, Google OAuth | Guests get a signed rejoin token instead of an account |
| Shared contract | JSON Schema in `shared/`, quicktype | Generates TypeScript and Swift types for every socket event. CI fails if generated types are stale |
| API docs | OpenAPI 3 spec, shown in SwaggerHub | The same spec can generate the Swift REST client |
| Hosting | One DigitalOcean Droplet (1 GB, about $6/month), Nginx, Let's Encrypt | Nginx serves the React build and proxies `/api` and `/socket.io` to Node |

**Repo layout** ([ucfdevs/teraphobia](https://github.com/ucfdevs/teraphobia)): `server/`, `web/`, `ios/`, `shared/` (schemas and generated types), `docs/` (OpenAPI spec), `resources/` (this PRD and the UML diagrams), `.github/workflows/`.

**Server-side secrecy rule:** the server never sends a client anything that player shouldn't know. The Monster's identity, type, and power use exist only on the server and the Monster's phone; private clue results go only to the player who earned them.

## Data model

MongoDB stores accounts and finished games only; a live game lives in server memory until it ends. Four collections cover v1. See the [ERD](diagrams/erd.png) and [class diagram](diagrams/class.png).

| Collection | Key fields | Notes |
| --- | --- | --- |
| `users` | `_id`, `email` (unique), `passwordHash?`, `googleId?`, `emailVerified`, `displayName`, `avatarId`, `stats { gamesPlayed, villagerWins, monsterWins { vampire, witch, werewolf } }`, `createdAt` | `passwordHash` or `googleId`, or both when linked. Stats are counters updated at game end |
| `authTokens` | `_id`, `userId`, `type` (verify, reset, refresh), `tokenHash`, `expiresAt`, `usedAt?` | TTL index on `expiresAt`. Only hashes are stored |
| `games` | `_id`, `roomCode`, `hostUserId`, `preset`, `startedAt`, `endedAt`, `playerCount`, `monsterType`, `winner` (villagers, monster), `endReason` (banished, outnumbered, forfeit), `rounds` | One document per finished game |
| `gamePlayers` | `_id`, `gameId`, `userId?`, `displayName`, `costume { hat, mask, item }`, `role` (villager, monster), `outcome` (won, lost), `diedRound?`, `nightHunches [playerId]` | Guests are saved with no `userId`. History queries use an index on `userId` |

**In memory only (live game):** room code, seats and rejoin tokens, phase and timer, costumes, Monster seat and type, power used, candle targets, daily cap counters, votes. A server restart ends live games; that is accepted for v1.

## REST API and socket events

REST handles everything outside a live game and is what SwaggerHub shows; Socket.io carries the game itself. Every REST endpoint gets at least one unit test.

### REST (JSON, prefix `/api`)

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `POST /auth/register` | None | Create account, send verification email |
| `POST /auth/verify` | None | Confirm email with token |
| `POST /auth/resend-verification` | None | Send a new verification email |
| `POST /auth/login` | None | Email and password sign in |
| `POST /auth/google` | None | Sign in with a Google ID token (web and iOS) |
| `POST /auth/refresh` | Refresh token | New access token |
| `POST /auth/logout` | User | Revoke refresh token |
| `POST /auth/forgot-password` | None | Email a reset link |
| `POST /auth/reset-password` | None | Set a new password with the reset token |
| `POST /auth/change-password` | User | Change password with the current one |
| `GET /users/me` | User | Profile and stats |
| `PATCH /users/me` | User | Update display name or avatar |
| `GET /users/me/games` | User | Paged game history |
| `GET /games/:id` | User who played it | One finished game's details |
| `POST /rooms` | Verified host | Create a room, returns code |
| `GET /rooms/:code` | None | Check a code before joining (open, started, full, not found) |
| `GET /health` | None | Deploy health check |

### Socket events

Every event is defined once in `shared/` JSON Schema; quicktype generates the TypeScript and Swift types.

| Direction | Event | Payload (summary) |
| --- | --- | --- |
| Client to server | `room:join` | code, displayName, rejoinToken? |
| Client to server | `room:kick` (host) | seatId |
| Client to server | `room:start` (host) | none |
| Client to server | `night:submit` | victimIds, or suspectId for Villagers |
| Client to server | `day:submit` | action (search, commune, candle), targetId? |
| Client to server | `power:use` (Monster) | targetId |
| Client to server | `vote:submit` | targetId or skip |
| Server to all | `room:state` | players, seats, host connected, preset |
| Server to all | `phase:start` | phase, round, endsAt |
| Server to all | `morning:reveal` | deadIds, or none |
| Server to all | `vote:reveal` | votes by player, banishedId? |
| Server to all | `game:over` | winner, monster seat and type, endReason, hunches |
| Server to one | `you:role` | role, monsterType (Monster only), costume |
| Server to one | `you:result` | private Search or Commune result |
| Server to one | `you:rejoined` | full private state after a reconnect |
| Server to one | `error` | code, message |

## Non-functional requirements

**Accessibility and Lighthouse**

- Lighthouse 95+ for performance and accessibility on desktop and mobile, checked in CI on the landing, sign-in, and profile pages.
- WCAG AA contrast on the dark theme; full keyboard use on web; VoiceOver labels and Dynamic Type on iOS.
- Costume traits are told apart by shape and name, never by color alone.
- Nothing important relies on sound.

**Security**

- HTTPS everywhere (Let's Encrypt); TLS between the server and Atlas.
- Passwords hashed with bcrypt; tokens stored only as hashes; access tokens short-lived.
- Rate limits on login, register, forgot-password, and room join.
- Input validated on every REST route and socket event against the shared schemas.
- Secrets only in environment variables on the Droplet and in GitHub Actions secrets, never in the repo.
- Server-side secrecy rule from Architecture: no client ever receives hidden info it isn't owed.
- Extra credit option: encrypt sensitive fields (email) at rest between the API and the database.

**Performance and reliability**

- Phase changes reach all clients within 1 second on a normal Wi-Fi network.
- One 1 GB Droplet handles at least 5 games of 8 players at once (load-tested).
- Atlas free tier limits (512 MB, about 100 operations per second) are fine because live state stays in memory.
- A failed deploy rolls back automatically after the health check fails.

## Testing strategy

The game engine is pure TypeScript with no I/O, so most rules are tested fast and without a browser; E2E tests then prove the full flows across many clients.

| Layer | Tool | What it covers |
| --- | --- | --- |
| Unit: game engine | Vitest | Deal rules (unique costumes, every player has a lookalike), caps, candle rules, Monster powers, vote and tie rules, win checks, a seeded random generator for repeatable games |
| Unit: REST | Vitest + Supertest, in-memory MongoDB | At least one test per endpoint (rubric), plus error cases for auth |
| Socket integration | Vitest + socket.io-client | Join, start, a full scripted game, secrecy (no client receives another player's private data) |
| E2E web | Playwright, multiple browser contexts | Host plus 4 to 8 simulated players: full game to each win condition, kick, room lock, vote reveal |
| Reconnect | Playwright + socket client | Player drop and rejoin, Monster gone 2 rounds (forfeit), host screen drop pauses timers |
| iOS | XCTest + XCUITest (Xcode Cloud) | Join flow, each phase screen, reconnect banner, decoding of generated types |
| Balance | Node script with bot strategies | Thousands of games per player count; flags any count where one side wins under 40% or over 60% |
| Lighthouse | Lighthouse CI | 95+ performance and accessibility, desktop and mobile |

## CI/CD and hosting

Every PR must pass CI before merging, and every merge to `main` deploys itself to the Droplet.

**On every pull request (GitHub Actions)**

1. Typecheck and lint `server/`, `web/`, and `shared/`.
2. Check the quicktype-generated types are up to date.
3. Unit and socket integration tests.
4. Playwright E2E against a test build of server + web.
5. Lighthouse CI on the web build.
6. Branch protection blocks the merge until all checks are green and one teammate approves.

**On merge to main**

1. GitHub Actions connects to the Droplet over SSH.
2. Pulls `main`, installs, builds server and web.
3. Restarts the server with pm2; Nginx serves the new web build.
4. Calls `/health`; if it fails, rolls back to the previous release.

**iOS (Xcode Cloud)**

- Builds and runs tests on PRs that change `ios/` or `shared/`.
- On merge to `main`, uploads a build to TestFlight. 25 compute hours a month come free with the Apple Developer Program ([Apple](https://developer.apple.com/news?id=ik9z4ll6)).
- TestFlight builds expire after 90 days, and the first build of each version needs beta review ([Apple](https://developer.apple.com/testflight/)).

**Hosting**

- One DigitalOcean Droplet (1 GB, about $6/month) running Node, pm2, and Nginx with Let's Encrypt.
- MongoDB Atlas free tier.
- The domain comes from an outside registrar (DigitalOcean doesn't appear to sell domains), with DNS managed in DigitalOcean.
- Environments: `main` is production. Each developer runs locally with a personal Atlas database or Docker MongoDB.

## Milestones, owners, and issues

Four milestones take the project from diagrams on Nov 6 to a tested, deployed game. The final demo is likely Dec 1 or Dec 3 (week of Nov 30), still subject to change. See the [schedule](diagrams/gantt.png).

| Milestone | Dates | Scope |
| --- | --- | --- |
| M0 Planning | Oct 29 to Nov 6 | PRD and diagrams, repo scaffold, CI skeleton, Droplet and domain. Gate: Nov 6 check-in |
| M1 Foundations | Nov 7 to Nov 15 | Auth and email, REST API and database, shared schemas, web and iOS shells |
| M2 Playable core | Nov 16 to Nov 24 | Lobby and rejoin, phase engine, actions, powers, vote, all game screens. Gate: full game playable |
| M3 Polish and ship | Nov 25 to Nov 30 | Stats and history, balance simulation, E2E and Lighthouse, art and presentation. Gate: final demo, Dec 1 or 3 |

**Owners by area (from team roles)**

| Label | Area | Owner | Backup |
| --- | --- | --- | --- |
| `api` | REST, auth, email, database | Teresa, Bernardo | Each other |
| `game` | Game engine, socket events, balance script | Teresa, Bernardo | Guilherme |
| `web` | React host screen and account pages | Lili, Cameron | Each other |
| `ios` | SwiftUI controller, TestFlight | Guilherme | Cameron |
| `infra` | CI/CD, Droplet, domain, Xcode Cloud | Cameron | Guilherme (CI/CD) |
| `design` | Tokens, costume art, screens | Lili, Cameron | Each other |
| `docs` | Diagrams, OpenAPI spec, presentation | Guilherme (PM) | Everyone |

**GitHub setup**

- One milestone per phase (M0 to M3) and the labels above.
- One issue per functional requirement (FR-1 to FR-16), split by platform where both apps need work (for example FR-5 web part and FR-5 iOS part).
- Each issue holds its acceptance criteria as a checklist and links back to this PRD.
- A GitHub Project board with Todo, In progress, In review, Done.

## v2 ideas

- Stats: clues found, votes cast on the real Monster, night hunch accuracy.
- Remote play with in-app chat.
- Android app; App Store release.
- More Monster types and costume slots.
- Printable rules sheet and card set, once the art is final.
