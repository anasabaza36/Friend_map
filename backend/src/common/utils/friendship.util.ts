export function normalizeFriendPair(
  userId1: string,
  userId2: string,
): { userAId: string; userBId: string } {
  if (userId1 === userId2) {
    throw new Error('Cannot normalize a friendship pair with identical user IDs');
  }

  return userId1 < userId2
    ? { userAId: userId1, userBId: userId2 }
    : { userAId: userId2, userBId: userId1 };
}
