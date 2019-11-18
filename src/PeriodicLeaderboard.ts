import { Leaderboard } from './Leaderboard';
import { Redis, KeyType } from 'ioredis';
import moment from 'moment';

/**
 * Time interval of one leaderboard cycle
 */
export type TimeFrame = 'minute' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all-time';

export type PeriodicLeaderboardOptions = {
    timeFrame: TimeFrame,
    now(): Date
}

export class PeriodicLeaderboard {
    private client: Redis;
    private options: PeriodicLeaderboardOptions;
    private format: string;

    constructor(client: Redis, options: Partial<PeriodicLeaderboardOptions> = {}) {
        this.client = client;
        this.options = Object.assign({
            timeFrame: 'all-time',
            now: () => new Date
        }, options);
        this.format = PeriodicLeaderboard.momentFormat(this.options.timeFrame);
    }

    private static momentFormat(timeFrame: TimeFrame): string {
        if(timeFrame == 'all-time')
            return '[all]';
        
        const frames = [ 'yearly', 'monthly', 'weekly', 'daily', 'hourly', 'minute'];
        const format = ['[y]YYYY',   '[m]MM',   '[w]w',  '[d]D',  '[h]HH',  '[m]mm'];

        return format.slice(0, frames.indexOf(timeFrame) + 1).join('-');
    }

    /**
     * Return the format used for the current Time Frame
     */
    getKeyFormat() {
        return this.format;
    }

    /**
     * Returns the key of the leaderboard that
     * should be used based on the current time
     */
    getCurrentKey(): string {
        return moment(this.options.now()).format(this.format);
    }
}
