# Farmhands

A cross-platform Expo app for connecting farmers with available labour groups.

## Run

```bash
nvm use 24.21.0
npm install
npm run start
```

Use the project-local Expo CLI through the npm scripts above. Do not run the deprecated global `expo-cli` command; it is not compatible with Node 24.

Both the Expo frontend and NestJS backend require Node.js 24. The frontend uses Expo SDK 51 with React Native 0.74, a stable SDK line compatible with this project. After installing Node, reopen VS Code so its terminal sees the new PATH.

Then press `a` for Android, `i` for iOS, or `w` for web. iOS builds require macOS/Xcode; Android runs through an emulator or Expo Go.

## Backend

The backend is a NestJS API in `backend/` backed by PostgreSQL. Start the database from the workspace root, then start the API:

```bash
docker compose up -d postgres
cd backend
nvm use 24
npm install
npm run start:dev
```

Requests are stored in PostgreSQL and loaded from the API when the Home screen opens. For Expo Go on a physical device, set `EXPO_PUBLIC_API_URL` to the computer's LAN address (for example, `http://192.168.1.20:3000/api`) before starting Expo; `localhost` refers to the device itself.

Home addresses use the device's current location and resolve its area name through Google Geocoding. Enable the Geocoding API and billing in Google Cloud, then configure `GOOGLE_MAPS_API_KEY` in the backend process environment. Keep this key on the server; do not use an `EXPO_PUBLIC_` variable for it. For example, in PowerShell, set `$env:GOOGLE_MAPS_API_KEY = "your-key"` in the backend terminal before running `npm run start:dev`.

Profile and request photos can be selected from the device and are uploaded to `backend/uploads/`. Keep this directory on persistent storage when deploying the backend; uploads are limited to 5 MB per image.

The Find Workers screen loads labour profiles from PostgreSQL through the workers API. Worker profiles are users with the `labour` role; search exposes display name, labour area, skills, daily rate, travel radius, date availability, distance, and review aggregates, never phone number or home address. Workers can add coordinates from Labour setup; farmer distance filters use the device's current location. Labour setup, skills, and date-specific availability are persisted on the user profile. Farmers can rate completed bookings, record attendance and review tags, and optionally save a worker. My workers combines saved profiles with completed/confirmed booking history. Saved search alerts are evaluated against current worker availability in the Alerts screen; per-worker availability notification preferences are persisted, but background push/SMS delivery is not configured. No sample workers or reviews are inserted.

Implementation progress: **7 of 7 planned screen groups are implemented.** The final group adds role selection and first-run farmer setup (#01–04/#16/#23/#25), persisted English/Telugu preference, farmer and labour profile polish with sign-out confirmation (#27–28), saved worker-search recovery when offline (#37), and persisted labour group rosters (#42). Group size is returned from the worker API, participates in farmer worker selection and request capacity, is counted in bookings, and is used for attendance reviews. Earlier groups cover labour setup/profile/availability (#24/#21/#41/#20); farmer worker search and selection (#05/#33/#07/#08/#06); request creation (#34/#09/#10); labour request inbox and responses (#18/#38/#19/#40); booking lifecycle (#11–14/#30–32/#36/#39); and ratings, saved workers, and alerts (#15/#35/#17/#29). Worker, roster, availability, review, alert, request, booking, and profile data are backend-backed; no sample records were added.

The onboarding, group, and language migrations (`1761331800000`, `1761331900000`, and `1761332000000`) are added but have not been applied to a live PostgreSQL database. English and Telugu language preferences are persisted, but the full interface is not translated yet. Farmer location setup supports device location or manually entered area; it does not yet provide a draggable map pin. Offline fallback is limited to previously loaded worker searches with the exact same filters and does not permit creating requests or alerts while offline. Group roster names are user-entered and are not linked to independently verified accounts or invitations.

The first login flow is mobile OTP. Enter any non-empty OTP during development; the phone number is stored as a user in PostgreSQL. OTP validation must be replaced with a real SMS provider before production.

API routes:

- `GET /api/workers?from=YYYY-MM-DD&to=YYYY-MM-DD` (database-backed worker search; optional latitude/longitude, maxDistanceKm, minRating, skill, query, farmerId, and workedWithMe filters)
- `POST /api/workers/alerts` (save a farmer's worker search criteria; alert delivery is not configured yet)
- `GET /api/workers/:farmerId/alerts` (booking/request events and saved searches with currently available matches)
- `POST /api/workers/reviews` and `GET /api/workers/reviews/:requestId/:workerId?farmerId=:id` (submit/query one rating per completed booking, including attendance and tags)
- `GET /api/workers/:farmerId/saved?freeToday=true` (saved and previously booked workers, optionally filtered to those free today)
- `PUT /api/workers/:farmerId/saved/:workerId`, `PATCH /api/workers/:farmerId/saved/:workerId/alerts`, and `DELETE /api/workers/:farmerId/saved/:workerId` (save workers, set availability alert preference, and remove saved workers)
- `GET /api/groups/:leaderId` and `PUT /api/groups/:leaderId` (load and persist a labour group name and roster)
- `GET /api/requests?status=open`
- `GET /api/requests/options?farmerId=:id` (work skills, farm crops, and farm locations from PostgreSQL)
- `POST /api/requests` (persists work, crop, farm, schedule, pay, image URL, farmer ID, and selected worker IDs)
- `GET /api/requests/worker/:workerId?bucket=new|accepted|past` (requests assigned to the worker, with farmer identity and request details)
- `POST /api/requests/:requestId/respond` (persist a worker's accept/decline response and decline reason)
- `GET /api/requests/bookings/:userId?role=farmer|labour&bucket=upcoming|pending|past` (participant bookings and incoming worker replies)
- `GET /api/requests/bookings/:requestId/:workerId?userId=:id` (booking details and participant-only contact information)
- `POST /api/requests/bookings/:requestId/:workerId/cancel` (cancel a confirmed booking)
- `POST /api/requests/:requestId/cancel` and `POST /api/requests/:requestId/repeat` (close an open request or resend an expired/cancelled request)
- `POST /api/requests/image` (upload a request crop photo; JPEG, PNG, WebP, or HEIC, up to 5 MB)
- `POST /api/auth/request-otp`
- `POST /api/auth/verify-otp`
- `GET /api/users/:id`
- `POST /api/users/:id/profile-image` (upload a profile photo; JPEG, PNG, WebP, or HEIC, up to 5 MB)
- `PATCH /api/users/:id` (profile details, onboarding completion, preferred language, roles, labour skills/area/daily rate/travel radius/location coordinates/today and date-specific availability, and agricultural locations; each location stores a Google Maps link)
- `GET /api/places/autocomplete?input=...`
- `GET /api/places/reverse-geocode?latitude=...&longitude=...`
- `GET /api/places/:placeId`

The backend currently uses PostgreSQL through TypeORM. Request recipients have per-worker response state in `request_recipients`; migrations backfill recipients from existing request worker IDs and create booking records, request expiry, cancellation metadata, booking-linked rating fields, saved workers, onboarding fields, labour groups, and group booking counts. Migrations are added but have not been applied to a live database. Application management, messaging, farmer ratings, and background notification delivery are not implemented. The current development OTP token is not production authentication; worker/farmer endpoints use profile IDs supplied by the app and require proper authorization before deployment.
