# Firestore Security Specification

## 1. Data Invariants
1. All documents live strictly under `/users/{userId}` and `/users/{userId}/events/{eventId}` — there is no global public read/write collection.
2. Only verified authenticated users (`request.auth != null && request.auth.token.email_verified == true`) can access their own `userId` namespace (`request.auth.uid == userId`).
3. Every `SyncedEvent` subcollection document requires the parent `/users/{userId}` profile document to exist (`exists` / `existsAfter` Master Gate) and enforces `data.userId == userId`.
4. All document IDs (`userId`, `eventId`) must satisfy `^[a-zA-Z0-9_-]+$` with length `1..128`.
5. No plaintext AndrewsPlan passwords are ever permitted in Firestore; `keys().hasOnly(...)` blocks any shadow/extra fields.
6. Server timestamps (`request.time`) are enforced on `createdAt` (create) and `updatedAt` (create & update), with `createdAt` and `userId` immutable after creation.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read of `/users/user123`.
2. Verified user `alice` reading `/users/bob`.
3. Unverified email user (`email_verified: false`) writing `/users/alice`.
4. Spoofed ownership: `alice` creating `/users/alice` with `userId: "bob"`.
5. Shadow field injection: `alice` creating `/users/alice` with extra field `isAdmin: true`.
6. Missing required field: `alice` creating `/users/alice` without `cloudplanUsername`.
7. Oversized string DoS: `alice` writing `summary` with 5,000 characters (`> 300`).
8. Invalid theme enum: `alice` writing `theme: "neon-purple"`.
9. Client-forged timestamp: `alice` creating `/users/alice` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`.
10. Immutable field mutation: `alice` updating `/users/alice` changing `createdAt` or `userId`.
11. ID poisoning: `alice` writing `/users/alice/events/bad.id$with/chars` (invalid `eventId`).
12. Cross-user list scraping: `alice` listing `/users/bob/events`.
