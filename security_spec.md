# Security Specification — KADENCE Social Self-Improvement Platform

## 1. Data Invariants
1. **PII Isolation**: Email addresses, notification preferences, referral attribution, and privacy settings live strictly in `/users/{userId}` and are readable only by `request.auth.uid == userId`. `/public_profiles/{userId}` contains zero PII.
2. **Private Habit Isolation**: Habits with `isPublic == false` and their `habit_records` with `isPublic == false` cannot be read (`get` or `list`) by any user other than `userId == request.auth.uid`.
3. **Deterministic Anti-XP-Farming & Score Separation**:
   - `habit_records` documents must use deterministic ID `${uid}_${habitId}_${localDate}`, blocking duplicate check-ins on the same day.
   - `xp_transactions` documents are strictly append-only (`update, delete: if false`), must start with `${uid}_`, and cap rewards (`habit <= 20`, `daily_bonus == 30`, `streak_7 == 50`, `challenge_win <= 200`, `team_goal <= 200`, `league_reward <= 100`, `referral_bonus == 30`).
   - `users/{uid}` and `public_profiles/{uid}` XP updates require `existsAfter(/databases/.../xp_transactions/$(incoming().lastTxId))` and exact delta matching `getAfter(...).data.amount`.
   - Weekly `competitionScore` (`0..1000`) is stored separately in `competition_scores` and never inflates XP or user level.
4. **Immutable Edit Audit Trail**:
   - Existing `habit_records` may be edited by their owner without altering `xpEarned` or `completedAt`, and every edit increments `editCount` and creates an append-only record in `/habit_record_audit_logs/{logId}` (`update, delete: if false`).
5. **Competition Rule & Settlement Locking**:
   - `competition_seasons` rules (`leagueType`, `weekKey`, `scoringWeights`, `minVerificationLevel`, `maxCompetitionHabits`, `rulesLocked`) are immutable once created. Once `status == 'settled'`, `winnerId`, `mostImprovedUid`, and scores cannot be modified.
   - `competition_scores` cannot modify `competitionScore`, `consistencyRate`, or `improvementDelta` once the corresponding season has settled (only `rewardClaimed: false -> true` is allowed).
   - Once a `challenge` reaches `completed` or `declined`, no further updates are permitted; its rules (`dailyCap`, `scoringMethod`, `requiredVerificationLevel`, `rulesLocked`, `xpPrize`) are immutable from creation.
   - Once a `team` / `team_challenge` reaches `completed`, no further status reversion is permitted, and `goalType`, `minMemberContribution`, `targetTotalCompletions`, and `xpPrize` are immutable.
6. **Referral Anti-Abuse**:
   - `/referrals/{invitedUid}` can only be created by `invitedUid == request.auth.uid` with `referrerUid != request.auth.uid` and `status == 'pending'`.
   - Transition to `status == 'activated'` requires proof of the invited user's `habit_records` document (`exists` or `existsAfter`), and the referrer can only set `claimedByReferrer = true` after `status == 'activated'`.
7. **Friendship & Feed Circle Access Control**:
   - Friendships require `pending` created by `requesterId == request.auth.uid`, and only `recipientId` may transition to `accepted` or `declined`.
   - `activity_feed` items store a bounded `visibleTo` list (`size() <= 100`), and reads/reactions/comments verify `request.auth.uid in visibleTo`.
8. **Temporal Integrity**: `createdAt`, `updatedAt`, `completedAt`, `editedAt`, `unlockedAt`, `joinedAt`, `settledAt`, `activatedAt` must equal `request.time`.

## 2. Dirty Dozen+ Attack Payloads (Must Return PERMISSION_DENIED)
1. **PII Cross-Read**: User B calls `getDoc(doc(db, 'users', userA_uid))` -> DENIED.
2. **Unverified Email Write**: User with `email_verified: false` attempts to create a habit -> DENIED.
3. **Shadow Field Injection**: User A creates a habit with extra shadow key `isAdmin: true` -> DENIED (`hasOnly`).
4. **XP Spoofing on Habit**: User A creates a habit with `xpReward: 5000` -> DENIED (`xpReward in [10, 20]`).
5. **Duplicate Check-In Farming**: User A attempts to create a second `habit_records` doc with custom ID `fake_id_123` -> DENIED.
6. **Direct XP Inflation**: User A updates `users/{uid}` setting `totalXp: 99999` without atomic `xp_transactions` -> DENIED (`getAfter` invariant).
7. **Mutate XP Ledger or Audit Log**: User A attempts `updateDoc` or `deleteDoc` on `xp_transactions/{txId}` or `habit_record_audit_logs/{logId}` -> DENIED.
8. **Private Habit Snooping**: User B queries `habits` with `where('userId', '==', userA_uid)` without `where('isPublic', '==', true)` -> DENIED (`allow list`).
9. **Unauthorized Friendship Accept**: User A (requester) attempts to update `friendships/{id}` `status` from `pending` to `accepted` -> DENIED.
10. **Stranger Feed Reaction**: User C (not in `visibleTo`) attempts to create a comment under `activity_feed/{feedId}/comments/{cId}` -> DENIED.
11. **Post-Completion Challenge / Season Tamper**: User A attempts to update `winnerId` on a `challenge` (`status == 'completed'`) or a settled `competition_seasons` doc (`status == 'settled'`) -> DENIED.
12. **Team Capacity Overflow**: 11th user attempts to join a `team_challenges` doc where `memberUids.size() == 10` -> DENIED (`memberUids.size() <= 10`).
13. **Self-Referral or Premature Referral Claim**: User A creates `/referrals/{uid}` with `referrerUid == uid`, or tries to claim a referral whose `status == 'pending'` -> DENIED.
14. **Edit-Time XP Inflation**: User A updates an existing `habit_records` doc changing `xpEarned: 20` or omitting `editCount` increment -> DENIED.
