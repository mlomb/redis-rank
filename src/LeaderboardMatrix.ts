import { Redis, Pipeline } from 'ioredis';
import { Leaderboard, LeaderboardOptions, ID } from './Leaderboard';
import { TimeFrame, PeriodicLeaderboard } from './PeriodicLeaderboard';

export type DimensionDefinition = {
    /** dimension name */
    name: string;
    /** dimension Time Frame */
    timeFrame?: TimeFrame
}

export type FeatureDefinition = {
    /** feature name */
    name: string;
    /** underlying leaderboard options. path is ignored */
    options?: LeaderboardOptions;
}

export type LeaderboardMatrixOptions = {
    /**
     * base path to store all the leaderboards
     * 
     * <path>:<dimension>:<feature>:<time key>
     */
    path: string,
    /** leaderboard dimensions. Provide at least one */
    dimensions: DimensionDefinition[],
    /** leaderboard features. Provide at least one */
    features: FeatureDefinition[],
    /** custom function to evaluate the current time */
    now(): Date
}

export class LeaderboardMatrix {
    /** ioredis client */
    private client: Redis;
    /** options */
    private options: LeaderboardMatrixOptions;
    /** matrix with the leaderboards */
    private matrix: (PeriodicLeaderboard | null)[][];

    constructor(client: Redis, options: Partial<LeaderboardMatrixOptions> = {}) {
        this.client = client;
        
        this.options = Object.assign({
            path: 'lbmatrix',
            dimensions: [{
                name: 'global',
                timeFrame: 'all-time'
            }],
            features: [{
                name: 'default',
                options: {
                    lowToHigh: false
                }
            }],
            now: () => new Date()
        }, options);

        this.matrix = new Array(this.options.dimensions.length).fill(0).map(() => new Array(this.options.features.length).fill(null));
    }

    /**
     * Get the corresponding leaderboard in the matrix
     */
    get(dimension: string, feature: string, time?: Date): (Leaderboard | null) {
        // check dimension & feature
        let dim_index = this.options.dimensions.findIndex((dim) => dim.name === dimension);
        let feat_index = this.options.features.findIndex((feat) => feat.name === feature);

        if(dim_index === -1 || feat_index === -1) {
            return null;
        }

        if(this.matrix[dim_index][feat_index] === null) {
            let dim = this.options.dimensions[dim_index];
            let feat = this.options.features[feat_index];

            this.matrix[dim_index][feat_index] = new PeriodicLeaderboard(this.client, {
                path: `${this.options.path}:${dim.name}:${feat.name}`,
                timeFrame: dim.timeFrame || 'all-time',
                now: this.options.now,
                leaderboardOptions: feat.options
            });
        }

        return (this.matrix[dim_index][feat_index] as PeriodicLeaderboard).get(time ? time : this.options.now());
    }

    /**
     * Creates or updates an entry present in multiple leaderboards in the matrix
     * 
     * e.g.
     * 
     * ```
     * add('id', {
     *   feature1: 99,
     *   feature2: 48
     * }, ['dimension1', 'dimension2'])
     * ```
     * 
     * Note: if a feature/dimension is invalid, the combination is ignored
     * 
     * @param features key-value object with features as key and values as scores
     * @param dimensions if provided, insertion will only occur on the provided dimensions.
     *                   if not provided, all dimensions are used
     */
    add(id: ID, features: { [key: string]: number }, dimensions: string[] = []): Promise<void> {
        if(dimensions.length == 0) { // use all dimensions
            dimensions = this.options.dimensions.map((dim) => dim.name);
        }

        let pipeline: Pipeline = this.client.multi();

        for(let dimension of dimensions) {
            for(let feature in features) {
                let lb = this.get(dimension, feature);
                if(lb) {
                    pipeline = lb.addMulti(id, features[feature], pipeline);
                }
            }
        }

        return pipeline.exec();
    }
}
