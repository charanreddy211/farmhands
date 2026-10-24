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

The first login flow is mobile OTP. Enter any non-empty OTP during development; the phone number is stored as a user in PostgreSQL. OTP validation must be replaced with a real SMS provider before production.

API routes:

- `GET /api/groups?available=true`
- `GET /api/requests?status=open`
- `POST /api/requests`
- `POST /api/auth/request-otp`
- `POST /api/auth/verify-otp`

Recommended production database: PostgreSQL with Prisma. Suggested tables are `profiles`, `farms`, `labour_groups`, `group_members`, `availability`, `labour_requests`, `applications`, `messages`, `reviews`, and `notifications`.

