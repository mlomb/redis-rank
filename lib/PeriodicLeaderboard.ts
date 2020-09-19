import { Redis } from 'ioredis';
import { Leaderboard, LeaderboardOptions } from './Leaderboard';

/** uniquely identifies a cylce in a periodic leaderboard  */
export type PeriodicKey = string;

type DefaultCycles =
    'minute' |
    'hourly' |
    'daily' |
    'weekly' |
    'monthly' |
    'yearly' |
    'all-time';

type CycleFunction = (time: Date) => PeriodicKey;

/**
 * The cycle of a periodic leaderboard.  
 * You can use one of the predefined cycles:  
 * `minute`, `hourly`, `daily`, `weekly`, `monthly`, `yearly`, `all-time`
 * 
 * Or you can specify a custom function, taking a Date object and returning the
 * corresponding PeriodicKey for the provided time (internally this is the
 * suffix for the Redis key)
 */
export type PeriodicLeaderboardCycle = CycleFunction | DefaultCycles;

export type PeriodicLeaderboardOptions = {
    /** base key to store the leaderboards */
    path: string,
    /** underlying leaderboard options  */
    leaderboardOptions: LeaderboardOptions,

    /** function to evaluate the current time */
    now?: () => Date,
    /** cycle */
    cycle: PeriodicLeaderboardCycle
}

const CYLCE_FUNCTIONS: { [cycle in DefaultCycles]: CycleFunction } = {
    'minute': (time: Date) => "a",
    'hourly': (time: Date) => "a",
    'daily': (time: Date) => "a",
    'weekly': (time: Date) => "a",
    'monthly': (time: Date) => "a",
    'yearly': (time: Date) => "a",
    'all-time': (time: Date) => "a",
};

export class PeriodicLeaderboard {
    /** ioredis client */
    private client: Redis;
    /** options */
    private options: PeriodicLeaderboardOptions;
    /** active leaderboard */
    private leaderboard: (Leaderboard | null) = null;

    constructor(client: Redis, options: PeriodicLeaderboardOptions) {
        this.client = client;
        this.options = options;
    }

}
