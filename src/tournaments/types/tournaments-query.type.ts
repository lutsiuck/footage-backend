import { TournamentStatus, TournamentType } from '@prisma/client';

export type TournamentsQuery = {
  name?: string;
  city?: string;
  types?: TournamentType[];
  statuses?: TournamentStatus[];
  limit?: number;
  offset?: number;
};
