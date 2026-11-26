# Social App – Backend

REST API for a social app: **Auth module** + **User module**.
Stack: Node.js (18+), Express 4, MongoDB (Mongoose), JWT, Zod, Nodemailer.

## Quick start
```bash
cp .env.example .env      # fill in values
npm install
npm run dev               # http://localhost:5000
```
Or with Docker: `docker compose up --build`

In development, if `SMTP_HOST` is empty, emails (verification link / reset OTP) are **printed to the console**.

## Auth module  (`/api/v1/auth`)
| Method | Path | Description |
|---|---|---|
| POST | `/register` | Create account + send verification email |
| GET/POST | `/verify-email?token=` | Verify email (secure link, 24h) |
| POST | `/resend-verification` | Resend verification email |
| POST | `/login` | `{identifier (email/username), password}` → access + refresh tokens |
| POST | `/refresh` | Rotate refresh token (reuse detection revokes the whole session family) |
| POST | `/logout` | Revoke one refresh token |
| POST | `/logout-all` | Revoke all sessions (Bearer) |
| POST | `/forgot-password` | Send 6-digit OTP (10 min) |
| POST | `/reset-password` | `{email, otp, newPassword}` (max 5 attempts, revokes all sessions) |
| POST | `/google` | `{idToken}` Google sign-in (OAuth 2.0 / OpenID ID token) |

**Token pattern:** short-lived JWT access token (15m) in the `Authorization: Bearer` header + opaque
refresh token (7d) stored **hashed** in the DB, rotated on every use.

## User module  (`/api/v1/users`, Bearer required)
| Method | Path | Description |
|---|---|---|
| GET / PATCH / DELETE | `/me` | Get / update (name, username, bio, avatar URL) / delete account |
| PATCH | `/me/settings` | `{isPrivate}` public vs private profile |
| PATCH | `/me/password` | Change password (revokes old sessions, returns new tokens) |
| GET | `/:username` | Profile + relationship (`isFollowing`, `isRequested`, `followsYou`) |
| POST / DELETE | `/:id/follow` | Follow (pending if private) / unfollow or cancel request |
| GET | `/:id/followers`, `/:id/following` | Paginated lists (private accounts: followers only) |
| GET | `/me/follow-requests` | Pending requests |
| POST | `/me/follow-requests/:requesterId/accept` | Accept |
| DELETE | `/me/follow-requests/:requesterId` | Reject |
| GET | `/search?q=&page=&limit=` | Search by username / name |
| GET | `/suggestions?limit=` | Friends-of-friends ranked by mutual follows, padded with popular users |

Responses: `{ success, data, pagination? }` – errors: `{ success:false, message, details? }`.

## Security notes
helmet, CORS allow-list, rate limiting (global + auth + OTP), bcrypt (12 rounds), hashed refresh tokens & OTPs,
no account enumeration on forgot/resend, input validation on every route, password change invalidates old access tokens.

## Structure
```
src/
  config/ models/ controllers/ routes/ validators/ middleware/ utils/
  app.js  server.js
```
