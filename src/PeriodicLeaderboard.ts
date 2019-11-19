import { Leaderboard, LeaderboardOptions } from './Leaderboard';
import { Redis } from 'ioredis';
import moment from 'moment';

/**
 * Time interval of one leaderboard cycle
 */
export type TimeFrame = 'minute' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all-time';

export type PeriodicLeaderboardOptions = {
    /** base key to store the leaderboards (plb:<time key>) */
    path: string,
    /** leaderboard cycle */
    timeFrame: TimeFrame,
    /** custom function to evaluate the current time */
    now(): Date,
    /** underlying leaderboard options */
    leaderboardOptions?: LeaderboardOptions
}

export class PeriodicLeaderboard {
    /** ioredis client */
    private client: Redis;
    /** options */
    private options: PeriodicLeaderboardOptions;
    /** cached Time Frame format */
    private format: string;
    /** active leaderboard */
    private leaderboard: (Leaderboard | null) = null;

    constructor(client: Redis, options: Partial<PeriodicLeaderboardOptions> = {}) {
        this.client = client;
        this.options = Object.assign({
            path: "plb",
            timeFrame: 'all-time',
            now: () => new Date,
            leaderboardOptions: null
        }, options);
        this.format = PeriodicLeaderboard.momentFormat(this.options.timeFrame);
    }

    /**
     * Returns the appropiate moment format for a Time Frame
     * 
     * e.g. for 'minute' [y]YYYY-[m]MM-[w]ww-[d]DD-[h]HH-[m]mm
     */
    private static momentFormat(timeFrame: TimeFrame): string {
        if(timeFrame == 'all-time')
            return '[all]';
        
        const frames = [ 'yearly', 'monthly', 'weekly', 'daily', 'hourly', 'minute'];
        const format = ['[y]YYYY',   '[m]MM',  '[w]ww', '[d]DD',  '[h]HH',  '[m]mm'];

        return format.slice(0, frames.indexOf(timeFrame) + 1).join('-');
    }

    /**
     * Return the format used for the current Time Frame
     */
    getKeyFormat() {
        return this.format;
    }

    /**
     * Get a the key of the leaderboard in a specific date
     */
    getKey(date: Date): string {
        return moment(date).format(this.format);
    }

    /**
     * Get a the leaderboard in a specific date
     */
    get(date: Date): Leaderboard {
        return new Leaderboard(this.client, {
            path: `${this.options.path}:${this.getKey(date)}`,
            ...this.options.leaderboardOptions
        });
    }

    /**
     * Returns the key of the leaderboard that
     * should be used based on the current time
     */
    getCurrentKey(): string {
        return this.getKey(this.options.now());
    }

    /**
     * Get the leaderboard based on the current time
     */
    getCurrent(): Leaderboard {
        let path = `${this.options.path}:${this.getCurrentKey()}`;
        
        if(this.leaderboard === null || this.leaderboard.getPath() !== path) {
            delete this.leaderboard;
            this.leaderboard = new Leaderboard(this.client, {
                ...this.options.leaderboardOptions,
                path: path
            });
        }

        return this.leaderboard;
    }
}
