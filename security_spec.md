# Security Specification for NutriScan

## 1. Data Invariants
- Every user's data is isolated under `/users/{userId}/...` where `userId == request.auth.uid`.
- Unauthenticated users cannot read, list, write, or delete any user document.
- Users cannot read or manipulate any other user's meals, favorites, profile, or chat transcripts.
- Strict payload validation enforces string lengths and valid types.

## 2. Dirty Dozen Attack Payloads & Defenses
1. Unauthorized cross-user profile read -> Rejected (userId must match request.auth.uid).
2. Unauthenticated meal logging -> Rejected (request.auth != null required).
3. Cross-user meal creation (userId spoofing) -> Rejected (request.resource.data.userId == request.auth.uid).
4. Modification of other user's favorite -> Rejected (parent path userId must match request.auth.uid).
5. Oversized chat message payload (> 4000 characters) -> Rejected (content.size() <= 4000).
6. Invalid meal type injection (e.g. mealType: 'midnight_cheat') -> Rejected (enum validation).
7. Negative or non-numeric calories -> Rejected (calories is number && calories >= 0).
8. Path traversal / ID poisoning (e.g. documentId with ../) -> Rejected (isValidId check).
9. Shadow field injection on user profile update -> Rejected (schema validation).
10. Cross-user chat message injection -> Rejected (request.auth.uid check).
11. Blank or empty meal name injection -> Rejected (name.size() > 0).
12. Blanket query scraping -> Rejected (list operations bounded to owner path).
