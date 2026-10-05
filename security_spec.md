# Security Specification & Threat Model

## Data Invariants
1. **User Identity Invariant**: A user document at `/users/{userId}` can only be read, created, or updated by the authenticated user whose `request.auth.uid == userId`.
2. **Study Note Ownership Invariant**: A study note at `/studyNotes/{noteId}` can only be accessed or modified by the user who created it (`request.auth.uid == resource.data.userId`).
3. **Immutability of Author & CreatedAt**: `userId` and `createdAt` can never be altered on update.
4. **Structural Validity**: Every document write must contain only allowed keys and adhere to strict size and type boundaries.

## The Dirty Dozen Payloads (Targeting Rejection)
1. **Unauthenticated Read**: Attempting to read `/users/user123` with `request.auth == null` -> DENIED.
2. **Spoofed User Creation**: User A (`auth.uid: userA`) attempts to write to `/users/userB` -> DENIED.
3. **Shadow Field Injection**: Attempting to create a user with extra field `{ isAdmin: true }` -> DENIED (`hasOnly` violation).
4. **Oversized Field Denial-of-Wallet**: Attempting to write a 1MB string in `question` (limit 2000 chars) -> DENIED.
5. **Unauthorized Note Read**: User A attempts to read User B's `/studyNotes/noteB` -> DENIED.
6. **Cross-Tenant Note Creation**: User A creates `/studyNotes/note1` with `userId: "userB"` -> DENIED.
7. **Identity Mutation on Update**: User A attempts to update `/studyNotes/note1` changing `userId` to `userB` -> DENIED.
8. **CreatedAt Timestamp Tampering**: User attempts to update `createdAt` to an arbitrary epoch time -> DENIED.
9. **Blanket Query Scraping**: Attempting an unrestricted list query across all users' study notes without `where("userId", "==", auth.uid)` -> DENIED by `allow list: if resource.data.userId == request.auth.uid`.
10. **Malicious Document ID**: Attempting to write to `/users/invalid%20id#with$weird!chars` -> DENIED by `isValidId`.
11. **Type Poisoning**: Attempting to set `isSaved` to `"yes"` (string) instead of `boolean` -> DENIED.
12. **Missing Required Keys**: Attempting to create a StudyNote missing `answer` -> DENIED.
