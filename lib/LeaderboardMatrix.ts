import { Redis } from 'ioredis';
import { Leaderboard, LeaderboardOptions } from './Leaderboard';
import { PeriodicLeaderboard, PeriodicLeaderboardCycle, NowFunction } from './PeriodicLeaderboard';

export type DimensionDefinition = {
    name: string;
    cycle?: PeriodicLeaderboardCycle
}

export type FeatureDefinition = {
    name: string;
    options: LeaderboardOptions;
}

export type LeaderboardMatrixOptions = {
    /** leaderboard dimensions. Provide at least one */
    dimensions: DimensionDefinition[],
    /** leaderboard features. Provide at least one */
    features: FeatureDefinition[],

    /** custom function to evaluate the current time for periodic leaderboards */
    now?: NowFunction
}

export class LeaderboardMatrix {

    private readonly client: Redis;
    private readonly baseKey: string;
    private readonly options: LeaderboardMatrixOptions;
    private readonly matrix: { [key: string]: (Leaderboard | PeriodicLeaderboard) };

    /**
     * 
     * @param client ioredis client
     * @param baseKey prefix for the redis key of all leaderboards in the matrix
     * @param options leaderboard matrix options
     */
    constructor(client: Redis, baseKey: string, options: LeaderboardMatrixOptions) {
        this.client = client;
        this.baseKey = baseKey;
        this.options = options;

        this.matrix = { };
        for(let dim of options.dimensions) {
            for(let feat of options.features) {
                let key = `${dim.name}:${feat.name}`;
                let redisKey = `${baseKey}:${key}`
                this.matrix[key] = new Leaderboard(client, redisKey, feat.options);
            }
        }
    }

}