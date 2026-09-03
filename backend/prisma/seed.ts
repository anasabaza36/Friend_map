import { PrismaClient, SharingMode } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function normalizeFriendPair(
  userId1: string,
  userId2: string,
): { userAId: string; userBId: string } {
  return userId1 < userId2
    ? { userAId: userId1, userBId: userId2 }
    : { userAId: userId2, userBId: userId1 };
}

const DEMO_USERS = [
  { email: 'alice@example.com', username: 'alice' },
  { email: 'bob@example.com', username: 'bob' },
  { email: 'charlie@example.com', username: 'charlie' },
  { email: 'david@example.com', username: 'david' },
  { email: 'emma@example.com', username: 'emma' },
] as const;

const FRIENDSHIP_PAIRS = [
  ['alice', 'bob'],
  ['alice', 'charlie'],
  ['bob', 'david'],
  ['charlie', 'emma'],
] as const;

/** Documented demo password for all seed users. Override via DEMO_PASSWORD env var. */
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'DemoPassword123!';

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const userIds = new Map<string, string>();

  for (const user of DEMO_USERS) {
    const record = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        username: user.username,
        passwordHash,
      },
      create: {
        email: user.email,
        username: user.username,
        passwordHash,
        avatarUrl: null,
      },
    });

    userIds.set(user.username, record.id);
  }

  for (const [usernameA, usernameB] of FRIENDSHIP_PAIRS) {
    const userAId = userIds.get(usernameA);
    const userBId = userIds.get(usernameB);

    if (!userAId || !userBId) {
      throw new Error(`Missing seeded user for friendship ${usernameA}-${usernameB}`);
    }

    const pair = normalizeFriendPair(userAId, userBId);

    await prisma.friendship.upsert({
      where: {
        userAId_userBId: { userAId: pair.userAId, userBId: pair.userBId },
      },
      update: {},
      create: pair,
    });
  }

  const aliceId = userIds.get('alice');
  const bobId = userIds.get('bob');
  const charlieId = userIds.get('charlie');
  const davidId = userIds.get('david');
  const emmaId = userIds.get('emma');

  if (!aliceId || !bobId || !charlieId || !davidId || !emmaId) {
    throw new Error('Missing seeded users for sharing settings');
  }

  await seedSharingSettings(aliceId, SharingMode.EVERYONE);
  await seedSharingSettings(bobId, SharingMode.SELECTED, {
    selectedFriendIds: [davidId],
  });
  await seedSharingSettings(charlieId, SharingMode.EXCEPT_SELECTED, {
    exceptFriendIds: [emmaId],
  });
  await seedSharingSettings(davidId, SharingMode.GHOST);
  await seedSharingSettings(emmaId, SharingMode.GHOST);

  console.log(`Seeded ${DEMO_USERS.length} demo users (password: ${DEMO_PASSWORD})`);
  console.log(`Seeded ${FRIENDSHIP_PAIRS.length} friendships`);
  console.log('Seeded sharing settings for all demo users');
}

async function seedSharingSettings(
  userId: string,
  mode: SharingMode,
  options?: {
    selectedFriendIds?: string[];
    exceptFriendIds?: string[];
  },
): Promise<void> {
  await prisma.sharingSettings.upsert({
    where: { userId },
    update: { mode },
    create: { userId, mode },
  });

  await prisma.sharingSelectedFriend.deleteMany({ where: { ownerId: userId } });
  await prisma.sharingExceptFriend.deleteMany({ where: { ownerId: userId } });

  if (options?.selectedFriendIds?.length) {
    await prisma.sharingSelectedFriend.createMany({
      data: options.selectedFriendIds.map((friendId) => ({ ownerId: userId, friendId })),
      skipDuplicates: true,
    });
  }

  if (options?.exceptFriendIds?.length) {
    await prisma.sharingExceptFriend.createMany({
      data: options.exceptFriendIds.map((friendId) => ({ ownerId: userId, friendId })),
      skipDuplicates: true,
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
