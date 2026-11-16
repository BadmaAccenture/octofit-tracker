# OctoFit Tracker architecture

OctoFit Tracker is a three-tier application for a school fitness program. The starter code includes API contracts and intentionally incomplete implementation points so you can use GitHub Copilot agent mode in a test-driven loop.

![Three-tier OctoFit architecture](../.github/images/octofit-architecture.svg)

## Tier boundaries

- **Presentation tier**: React 19, Vite, React Router, Bootstrap, and a shared API client in `octofit-tracker/frontend/src`.
- **Logic tier**: Express and TypeScript routes/services in `octofit-tracker/backend/src` expose `/api/*` behavior on port `8000`.
- **Data tier**: Mongoose models and seed data in `octofit-tracker/backend/src/models` and `src/scripts/seed.ts` persist to MongoDB on port `27017`.

## Ports and environment rules

- MongoDB: `27017`
- Express API: `8000`
- Vite frontend: `5173`
- The browser calls relative `/api` paths. Vite proxies them to `http://localhost:8000`, so the unauthenticated API port stays private in Codespaces. `VITE_API_BASE_URL` can override the base URL.

## API contract

| Capability | Method and path | Expected behavior |
| --- | --- | --- |
| Activity tracking | `GET /api/activities`, `POST /api/activities` | List and create valid activity records. POST accepts `userId`, `teamId`, `type`, and `minutes`; `userId` and `teamId` must be well-formed IDs for an existing user and team; otherwise respond with a deliberate 4xx (never a 500 from a cast error). A created activity stores the submitted `user`, `team`, `type`, and `minutes` plus computed `points` and `occurredAt`. |
| Teams | `GET /api/teams`, `POST /api/teams` | List and create teams with members. Created and listed teams keep the submitted `name` and `mascot`. Reject a team without a name with `400`. |
| Leaderboard | `GET /api/leaderboard` | Return teams ordered by the sum of their activity points, highest first. Each entry has `teamName`, `totalPoints`, and a 1-based `rank`. |
| Workout suggestions | `GET /api/workouts/suggestions/:userEmail` | Recommend workouts from recent activity patterns for the matching seeded user's email address. The first suggestion's `focus` matches that user's goal or recent activity, with a `reason` explaining why. An email with no matching user returns a deliberate 4xx (for example, `404`). |

## Implementation decisions

### Data tier (Mongoose models)

**Model validation strategy:**
- Add `required: true` validators to all User fields: `name`, `email`, `team`, `fitnessGoal`
- Add `required: true` validators to all Team fields: `name`, `mascot`
- Add `default: []` to Team `members` array to auto-initialize
- Add `required: true` validators to all Activity fields: `type`, `user`, `team`, `minutes`, `points`, `occurredAt`
- Add `required: true` validators to all Workout fields: `title`, `focus`, `minutes`, `difficulty`
- Rationale: Mongoose validates on `save()` and `validateSync()`, catching data tier contracts before services layer

### Logic tier (Express services in octofitService.ts)

**Activity creation (`createActivity`):**
- Accept input: `{ userId, teamId, type, minutes }`
- Validate required fields exist; return `400` with descriptive message if missing
- Validate `userId` and `teamId` are valid MongoDB ObjectIds (not cast errors); return `400` if malformed
- Query database for User and Team by ID; return `404` if either not found
- Calculate `points` as `minutes * 1.0` (1 point per minute, matching seed data: 40 min = 40 pts)
- Set `occurredAt` to current date/time (`new Date()`)
- Create Activity record with validated/computed fields
- Rationale: Explicit validation prevents 500 errors from cast failures; points are deterministic and simple

**Team creation (`createTeam`):**
- Accept input: `{ name, mascot, members? }`
- Validate `name` is provided and non-empty; return `400` with message "Team name is required" if missing
- Accept optional `members` array of user IDs
- Validate each member ID is a valid ObjectId; return `400` if any malformed
- Create Team record; Link team to members if provided by updating User `team` field
- Rationale: Name is mandatory for team identity; members optional at creation time per tests

**Leaderboard (`getLeaderboard`):**
- Use MongoDB aggregation to group Activity by `team`, sum `points` per group
- Look up Team name via `$lookup` on Team collection
- Sort by `totalPoints` descending (highest first)
- Assign 1-based `rank` based on sort position
- Return array of `{ teamName, totalPoints, rank }` objects
- Rationale: Aggregation is efficient; sorting and ranking done at database layer

**Workout suggestions (`suggestWorkouts`):**
- Find User by exact email match; return `404` with message "User not found" if no match
- Get user's `fitnessGoal` and recent Activity records (sorted by `occurredAt` descending)
- Match Workout where `focus` equals user's `fitnessGoal` OR most recent activity `type`
- Limit to first 1 Workout result
- Add `reason` field explaining selection: e.g., "Matches your endurance goal" or "Based on your recent run activity"
- Rationale: User-centric matching personalizes suggestions; reason explains recommendation to user

**Error handling pattern:**
- Catch validation errors from services
- Throw errors with `status` property: `Object.assign(new Error(message), { status: 4xx })`
- Express middleware catches and responds with error status and JSON message
- Never return 500 for validation/input errors (only 4xx)

### Presentation tier (React components)

**Component state pattern (Activities, Teams, Leaderboard, Workouts):**
- Three-state async pattern: `loading`, `data`, `error`
- Fetch on component mount via `useEffect`
- Use `api/client.ts` `getJson<T>()` function for all requests
- Render loading state with `role="status"` and text `/loading/i`
- Render empty state if data array is empty with descriptive text
- Render data in table or list format with all relevant fields
- Render error state with `role="alert"` and error message text

**Activities component:**
- GET `/api/activities` on mount; display table: type, minutes, points
- Empty state text: "No activities recorded yet"
- Error state: "Unable to load activities"
- Form to create activity (optional for full feature): userId, teamId, type, minutes inputs
- POST to `/api/activities` on submit; refresh list on success

**Teams component:**
- GET `/api/teams` on mount; display table: name, mascot, members (as list of IDs)
- Empty state text: "No teams created yet"
- Error state: "Unable to load teams"
- Form to create team (optional): name, mascot inputs
- POST to `/api/teams` on submit; refresh list on success

**Leaderboard component:**
- GET `/api/leaderboard` on mount; display ranked table: rank, teamName, totalPoints
- Empty state text: "No rankings available"
- Error state: "Unable to load leaderboard"
- Render rank as 1-based number; sort already applied by API

**Workouts component:**
- Input form: user email field
- On submit, GET `/api/workouts/suggestions/{email}` (URL-encoded email)
- Display first suggestion: title, focus, minutes, difficulty, reason
- Loading state: "Finding personalized suggestions"
- Empty state: "No suggestions available" (if array empty)
- Error state: "Unable to load suggestions" or specific 404 message if user not found

## Test plan

### Backend data-tier testing

**Command:** `npm run test:data --prefix octofit-tracker/backend`

**Tests in `tests/data.contract.test.ts`:**
- `requires meaningful user identity and goals` — Validates User model rejects empty docs; requires name, email, fitnessGoal
- `requires teams to have a name, mascot, and members array` — Validates Team model requires name and mascot; members default to empty array; accepts valid ObjectIds; rejects docs missing required fields
- `requires activities to connect users, teams, types, minutes, points, and dates` — Validates Activity model requires type, user, team, minutes, points, occurredAt
- `defines workout suggestions with focus, duration, and difficulty` — Validates Workout model requires title, focus, minutes, difficulty
- `seeds representative data for all four capabilities idempotently` — Verifies seed() creates demo users (Mona, Hubot), teams (Octocats, Robocats), activities (run, cycle), workouts (Intervals, Strength Circuit); runs seed twice and confirms same counts (idempotent); preserves unrelated data; reconciles user team membership

**What each failure means:**
- Missing validation error → Schema field is not required; add `required: true` to field
- Seed creates duplicate records → Use `updateOne(..., { upsert: true })` pattern instead of `create()`
- Seed deletes unrelated data → Ensure seed only upserts demo records, never drops collections

### Backend API-tier testing

**Command:** `npm run test:api --prefix octofit-tracker/backend`

**Tests in `tests/api.contract.test.ts`:**

#### Activity endpoints
- `creates and lists valid activities while rejecting invalid input`
  - POST with empty body → expects 400
  - POST with non-existent user/team IDs → expects 4xx (not 500)
  - POST with malformed ObjectIds → expects 4xx (not 500)
  - POST with valid user/team IDs → expects 201; response includes user, team, type, minutes, points (>0), occurredAt (valid date)
  - GET `/api/activities` → returns array of all activities with same fields

**What each failure means:**
- 500 on malformed ID → Input validation missing; check ObjectId.isValid() before query
- Missing points field → Calculate `points = minutes * 1.0` in createActivity()
- Invalid occurredAt → Set `occurredAt: new Date()` at creation time
- createActivity still returns 501 → Implement service function body; remove `throw` statement

#### Team endpoints
- `creates teams and exposes members`
  - POST without name → expects 400 (deliberate rejection)
  - POST with name, mascot, members → expects 201; response includes name, mascot, members array with user IDs
  - GET `/api/teams` → returns array with same team fields; members are accessible

**What each failure means:**
- 500 on missing name → Add name validation in createTeam(); throw error with status 400
- createTeam still returns 501 → Implement service function body
- Members not returned → Populate members on GET; use `.lean().populate('members')` or return members array directly

#### Leaderboard endpoint
- `orders leaderboard entries by total points`
  - Create 2 teams, 2 users, 3 activities (Robocats 35 pts total, Octocats 25 pts)
  - GET `/api/leaderboard` → expects 200; response array sorted descending by points
  - Response includes: teamName, totalPoints, rank (1-based: Robocats rank 1, Octocats rank 2)

**What each failure means:**
- Empty array → getLeaderboard() not implemented; add aggregation pipeline
- Wrong order → Sort by totalPoints descending (`-1`)
- Missing rank → Add rank field (1-based index + 1)
- Returning raw Team docs → Transform to `{ teamName, totalPoints, rank }` format

#### Workout suggestions endpoint
- `suggests workouts that match each user activity pattern`
  - Create Mona (endurance goal) with run activity; create Hubot (strength goal) with strength activity
  - Create workouts: Intervals (endurance focus), Strength Circuit (strength focus)
  - GET `/api/workouts/suggestions/mona%40example.com` → expects 200; first suggestion title "Intervals", focus "endurance", reason matching `/run|endurance|activity/i`
  - GET `/api/workouts/suggestions/hubot%40example.com` → expects 200; first suggestion title "Strength Circuit", focus "strength", reason matching `/strength|activity/i`
  - GET `/api/workouts/suggestions/nobody%40example.com` → expects 4xx (not 500)

**What each failure means:**
- 500 on unknown email → Add email validation; throw error with status 404 if user not found
- suggestWorkouts still returns empty/generic workouts → Match by user.fitnessGoal OR recent activity type; add reason field
- Reason field missing → Generate reason string explaining match (e.g., "Matches your endurance goal" or "Based on your recent activity")

### Frontend presentation-tier testing

**Command:** `npm test --prefix octofit-tracker/frontend`

**Tests in `tests/app.contract.test.tsx`:**

#### Cross-route rendering
- `renders activity data from the API`
  - Mock fetch to return `{ activities: [{ type: 'run', minutes: 30, points: 30 }] }`
  - Navigate to `/activities`; verify heading "Activities" renders
  - Verify activity data (e.g., "run" text) appears after API response
  - **What failure means:** Component not fetching on mount or not rendering fetched data; add useEffect with getJson() call

- `renders teams, leaderboard, and workout suggestions with accessible content`
  - Mock fetch for each route; navigate to `/teams`, `/leaderboard`, `/workouts`
  - Verify data (team name "Octocats", points "90", suggestion "Intervals") renders
  - **What failure means:** Component structure or data binding broken; verify render logic outputs data fields

- `requests workout suggestions for a specific user`
  - Navigate to `/workouts`
  - Verify fetch was called with URL matching `/api/workouts/suggestions/mona(%40|@)example\.com`
  - **What failure means:** Workout component not building URL correctly; verify email encoding (@ → %40)

#### Per-route state testing (Activities, Teams, Leaderboard, Workouts)
- `announces a loading state while the API request is pending`
  - Mock fetch to hang (return unresolved Promise)
  - Render component
  - Verify `role="status"` element exists with text matching `/loading/i`
  - **What failure means:** No loading indicator; add conditional render when `loading === true`

- `shows a meaningful empty state`
  - Mock fetch to return empty array (e.g., `{ activities: [] }`)
  - Render component
  - Verify text matching route-specific pattern appears:
    - Activities: `/no activities/i`
    - Teams: `/no teams/i`
    - Leaderboard: `/no (leaderboard|rankings|scores)/i`
    - Workouts: `/no (workout|suggestions)/i`
  - **What failure means:** No empty state; add conditional render when data array is empty

- `announces API failures as an accessible alert`
  - Mock fetch to return 503 status
  - Render component
  - Verify `role="alert"` element exists with text matching `/unable|unavailable|error/i`
  - **What failure means:** No error state; add try/catch in useEffect, store error in state, render role="alert" div

### Build validation

**Backend build:** `npm run build --prefix octofit-tracker/backend`
- Runs `tsc --noEmit` to check TypeScript
- Should complete with no errors or warnings
- Failure: Type mismatches in service implementations or model imports

**Frontend build:** `npm run build --prefix octofit-tracker/frontend`
- Runs TypeScript check then Vite build
- Should output optimized bundle to `dist/`
- Failure: Component JSX syntax errors or missing imports

### Integration verification (manual)

After all tests pass:
1. Seed database: `npm run seed --prefix octofit-tracker/backend`
2. Start backend: `npm run dev --prefix octofit-tracker/backend` (listens on 8000)
3. Start frontend: `npm run dev --prefix octofit-tracker/frontend` (listens on 5173)
4. Open browser to `http://localhost:5173`
5. Verify each route loads and displays seeded demo data:
   - Activities: shows Mona's 40-min run (40 pts), Hubot's 25-min cycle (25 pts)
   - Teams: shows Octocats (Mona, 1 member), Robocats (Hubot, 1 member)
   - Leaderboard: shows Robocats (35 pts, rank 1), Octocats (25 pts, rank 2)
   - Workouts: type email "mona@example.com" → suggests Intervals (endurance, 30 min)
6. Test form submissions (if implemented):
   - Add new activity → verifies activity appears in list
   - Add new team → verifies team appears in list
7. Verify error handling:
   - Disconnect MongoDB → refresh page → error message appears in alert
   - Stop backend → try form submission → error message appears
