import { customAlphabet } from 'nanoid';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { Errors } from '../middleware/errors.js';
import { getEvent } from '../events/event.service.js';

export const MAX_TEAM_SIZE = 3;

// Unambiguous invite code alphabet (no 0/O/1/I), 8 chars → hard to guess.
const genCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

export interface TeamView {
  id: string;
  name: string;
  inviteCode: string | null; // only exposed to members
  active: boolean;
  createdAt: Date;
  members: { id: string; name: string; role: string; joinedAt: Date }[];
  memberCount: number;
}

async function serializeTeam(teamId: string, includeInvite: boolean): Promise<TeamView> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      memberships: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
    },
  });
  if (!team) throw Errors.notFound('Team not found');
  return {
    id: team.id,
    name: team.name,
    inviteCode: includeInvite ? team.inviteCode : null,
    active: team.active,
    createdAt: team.createdAt,
    members: team.memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
    memberCount: team.memberships.length,
  };
}

export async function getTeamForUser(userId: string): Promise<TeamView | null> {
  const membership = await prisma.teamMembership.findUnique({ where: { userId } });
  if (!membership) return null;
  return serializeTeam(membership.teamId, true);
}

export async function createTeam(userId: string, name: string): Promise<TeamView> {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw Errors.badRequest('Team name must be at least 2 characters');

  const event = await getEvent();

  try {
    const team = await prisma.$transaction(async (tx) => {
      // A user may only belong to one active team.
      const existing = await tx.teamMembership.findUnique({ where: { userId } });
      if (existing) throw Errors.conflict('You already belong to a team');

      const created = await tx.team.create({
        data: {
          name: trimmed,
          inviteCode: genCode(),
          eventId: event?.id ?? null,
        },
      });
      await tx.teamMembership.create({
        data: { teamId: created.id, userId, role: 'OWNER' },
      });
      return created;
    });
    return serializeTeam(team.id, true);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = (e.meta?.target as string[] | undefined)?.join(',') ?? '';
      if (target.includes('name')) throw Errors.conflict('Team name is already taken');
      if (target.includes('userId')) throw Errors.conflict('You already belong to a team');
      throw Errors.conflict('Team could not be created');
    }
    throw e;
  }
}

export async function joinTeam(userId: string, inviteCode: string): Promise<TeamView> {
  const code = inviteCode.trim().toUpperCase();
  if (!code) throw Errors.badRequest('Invite code is required');

  const teamId = await prisma.$transaction(async (tx) => {
    const existing = await tx.teamMembership.findUnique({ where: { userId } });
    if (existing) throw Errors.conflict('You already belong to a team');

    const team = await tx.team.findUnique({ where: { inviteCode: code } });
    if (!team || !team.active) throw Errors.notFound('Invalid invite code');

    // Enforce max team size atomically inside the transaction.
    const count = await tx.teamMembership.count({ where: { teamId: team.id } });
    if (count >= MAX_TEAM_SIZE) {
      throw Errors.conflict(`Team is full (max ${MAX_TEAM_SIZE} members)`);
    }

    try {
      await tx.teamMembership.create({
        data: { teamId: team.id, userId, role: 'MEMBER' },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw Errors.conflict('You already belong to a team');
      }
      throw e;
    }
    return team.id;
  });

  return serializeTeam(teamId, true);
}

// Internal helper used by submissions/hidden-level: returns membership or throws.
export async function requireTeam(userId: string): Promise<{ teamId: string; role: string }> {
  const membership = await prisma.teamMembership.findUnique({ where: { userId } });
  if (!membership) throw Errors.forbidden('You must join or create a team first');
  return { teamId: membership.teamId, role: membership.role };
}
