import { Redis, RedisKey, Pipeline, ChainableCommander } from 'ioredis';
import { Leaderboard, LeaderboardOptions, ID, Rank, Score, SortPolicy, UpdatePolicy } from './Leaderboard';
import { PeriodicLeaderboard, PeriodicLeaderboardCycle, NowFunction } from './PeriodicLeaderboard';

export type DimensionName = string;
export type FeatureName = string;

export type DimensionDefinition = {
    name: DimensionName;
    cycle?: PeriodicLeaderboardCycle
}

export type FeatureDefinition = {
    name: FeatureName;
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

export type MatrixEntry = {
    /** identifier */
    id: ID,
    /** ranks */
    ranks: { [dimension: string ]: { [feature: string]: Rank } },
    /** scores */
    scores: { [dimension: string ]: { [feature: string]: Score } },
}

export type MatrixShowcase = {
    dimension: DimensionName,
    feature: FeatureName,
    entries: MatrixEntry[]
}

export type MatrixCount = {
    [dimension: string ]: {
        [feature: string]: number
    }
}

export type MatrixEntryUpdateQuery = {
    id: ID,
    values: { [ feature: string ]: number | Score }
}

/** filter query results */
export type MatrixLeaderboardQueryFilter = {
    /**
     * dimensions to include in the result. If undefined or empty,
     * all dimensions will be included
     */
    dimensions?: DimensionName[],
    /**
     * features to include in the result. If undefined or empty,
     * all features will be included
     */
    features?: FeatureName[]
};

/** internal query description */
type QueryInfo = {
    dimensions: DimensionName[],
    features: FeatureName[],
    keys: RedisKey[],
    sortPolicies: SortPolicy[]
}

export class LeaderboardMatrix {

    public readonly client: Redis;
    public readonly baseKey: string;
    public readonly options: LeaderboardMatrixOptions;

    private readonly matrix: { [key: string]: Leaderboard | PeriodicLeaderboard };
    private readonly allDimensions: DimensionName[];
    private readonly allFeatures: FeatureName[];

    /**
     * Create a matrix of leaderboards
     * 
     * @param client ioredis client
     * @param baseKey prefix for the Redis key of all leaderboards in the matrix
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
                this.matrix[key] =
                    // if a cycle is defined, use a periodic leaderboard
                    // otherwise use a regular leaderboard
                    dim.cycle ?
                        new PeriodicLeaderboard(client, redisKey, {
                            leaderboardOptions: feat.options,
                            now: options.now,
                            cycle: dim.cycle,
                        }) :
                        new Leaderboard(client, redisKey, feat.options);
            }
        }

        this.allDimensions = this.options.dimensions.map(d => d.name);
        this.allFeatures = this.options.features.map(d => d.name);
    }

    /**
     * Get the raw leaderboard object. The difference with `getLeaderboard` is
     * that you get the underlying periodic leaderboard wrapper instead of
     * a specific leaderboard of a periodic cycle.
     * 
     * @param dimension dimension name
     * @param feature feature name
     */
    getRawLeaderboard(dimension: DimensionName, feature: FeatureName): Leaderboard | PeriodicLeaderboard | null {
        let key = `${dimension}:${feature}`;
        let lb = this.matrix[key];
        return lb ? lb : null;
    }

    /**
     * Get a leaderboard in the matrix
     * 
     * Note: returns null if the dimension/feature pair is invalid
     * 
     * @param dimension dimension name
     * @param feature feature name
     * @param time time (for periodic leaderboards). If not provided, `now()` will be used
     */
    getLeaderboard(dimension: DimensionName, feature: FeatureName, time?: Date): Leaderboard | null {
        let lb = this.getRawLeaderboard(dimension, feature)
        if(!lb) // invalid leaderboard
            return null;
        if(lb instanceof PeriodicLeaderboard)
            lb = lb.getLeaderboardAt(time);
        return lb;
    }

    /**
     * Update one or more entries. If one of the entries does not exists,
     * it will be created. The update behaviour is determined by the sort and
     * update policies of each leaderboard in the matrix (or overriden
     * by `updatePolicy`)
     * 
     * @param entries entry or list of entries to update
     * @param dimensions filter the update to only this dimensions. If empty or undefined, all dimensions will be updated
     * @param updatePolicy override every default update policy only for this update
     */
    update(entries: MatrixEntryUpdateQuery | MatrixEntryUpdateQuery[], dimensions?: DimensionName[], updatePolicy?: UpdatePolicy): Promise<any> {
        if (!Array.isArray(entries))
            entries = [entries];

        if(!dimensions || dimensions.length === 0)
            dimensions = this.options.dimensions.map(x => x.name);

        let pipeline: ChainableCommander = this.client.pipeline();

        for(let dim of dimensions) {
            for(let feat of this.options.features) {
                let updates = entries
                    .map(e => ({ id: e.id, value: e.values[feat.name] }))
                    .filter(e => e.value !== undefined);
                if(updates.length) {
                    let lb = this.getLeaderboard(dim, feat.name);
                    if(lb) {
                        lb.updatePipe(updates, pipeline, updatePolicy);
                        lb.limitPipe(pipeline);
                    }
                }
            }
        }

        return Leaderboard.execPipeline(pipeline);
    }

    /**
     * Remove one or more entries from the leaderboards
     * 
     * @param ids ids to remove
     * @param dimensions dimensions to remove from. If empty or undefined, entries will be removed from all dimensions
     * @param features features to remove from. If empty or undefined, entries will be removed from all features
     */
    async remove(ids: ID | ID[], dimensions?: DimensionName[], features?: FeatureName[]) {
        dimensions = !dimensions || dimensions.length === 0 ? this.allDimensions : dimensions;
        features = !features || features.length === 0 ? this.allFeatures : features;

        let pipeline = this.client.pipeline();

        for(let dim of dimensions) {
            for(let feat of features) {
                let lb = this.getLeaderboard(dim, feat);
                if(lb)
                    pipeline.zrem(lb.redisKey, typeof ids === 'string' ? [ids] : ids);
            }
        }

        await pipeline.exec();
    }

    /**
     * Retrieve an entry. If it doesn't exist, it returns null
     * 
     * @param id entry id
     * @param filter filter to apply
     */
    async find(id: ID, filter: MatrixLeaderboardQueryFilter = {}): Promise<MatrixEntry | null> {
        let result = await this.execMatrix('zmatrixfind', filter, null, id);
        return result.length ? result[0] : null;
    }

    /**
     * Retrieve entries between ranks
     * 
     * @param dimensionToSort dimension to perform the sorting
     * @param featureToSort feature to perform the sorting
     * @param lower lower bound to query (inclusive)
     * @param upper upper bound to query (inclusive)
     * @param filter filter to apply
     */
    list(dimensionToSort: DimensionName, featureToSort: FeatureName, lower: Rank, upper: Rank, filter: MatrixLeaderboardQueryFilter = {}): Promise<MatrixEntry[]> {
        return this.execMatrixSort(
            'zmatrixrange',
            filter,
            dimensionToSort,
            featureToSort,
            Math.max(1, lower) - 1,
            Math.max(1, upper) - 1
        );
    }

    /**
     * Retrieve the top entries
     * 
     * @param max max number of entries to return
     */
    top(dimensionToSort: DimensionName, featureToSort: FeatureName, max: number = 10, filter: MatrixLeaderboardQueryFilter = {}): Promise<MatrixEntry[]> {
        return this.list(dimensionToSort, featureToSort, 1, max, filter);
    }
    
    /**
     * Retrieve the bottom entries (from worst to better)
     * 
     * @param max max number of entries to return
     */
    async bottom(dimensionToSort: DimensionName, featureToSort: FeatureName, max: number = 10, filter: MatrixLeaderboardQueryFilter = {}): Promise<MatrixEntry[]> {
        return (await this.execMatrixSort(
            'zmatrixrange',
            filter,
            dimensionToSort,
            featureToSort,
            -Math.max(1, max),
            -1
        )).reverse();
    }

    /**
     * Retrieve the entries around an entry
     * 
     * @see Leaderboard.around for details
     * @param dimensionToSort dimension to perform the sorting
     * @param featureToSort feature to perform the sorting
     * @param id id of the entry at the center
     * @param distance number of entries at each side of the queried entry
     * @param fillBorders include entries at the other side if the entry is too close to one of the borders
     * @param filter filter to apply
     */
    around(dimensionToSort: DimensionName, featureToSort: FeatureName, id: ID, distance: number, fillBorders: boolean = false, filter: MatrixLeaderboardQueryFilter = {}) {
        return this.execMatrixSort(
            'zmatrixaround',
            filter,
            dimensionToSort,
            featureToSort,
            id,
            Math.max(distance, 0),
            (fillBorders === true).toString(),
        );
    }

    /**
     * Returns the top `threshold` entries from a leaderboard that has at
     * least `threshold` entries. The `dimensionOrder` defines the order
     * to check the leaderboards, and `featureToSort` the feature (which is fixed).  
     * If no dimension meet the threshold, then the dimension with the highest
     * number of entries will be used to query the entries.  
     * If all dimensions have 0 entries, then returns null
     * 
     * Note: this function actually does two round trips to Redis!
     * (TODO: optimize, haven't done it for simplicity)
     * 
     * @param dimensionOrder order to test the dimensions
     * @param featureToSort feature to perform the sorting
     * @param threshold minimum number of entries that should be present in the leaderboard
     * @param filter filter to apply
     */
    async showcase(dimensionOrder: DimensionName[], featureToSort: FeatureName, threshold: number, filter: MatrixLeaderboardQueryFilter = { }): Promise<MatrixShowcase | null> {
        if(dimensionOrder.length === 0 || threshold < 0)
            return null;
        
        let counts = await this.count();
        let highest: number = 0;
        let highestDim: DimensionName | null = null;
        
        for(let dim of dimensionOrder) {
            let count = counts[dim] ? (counts[dim][featureToSort] || 0) : 0;
            if(count >= threshold) {
                return {
                    dimension: dim,
                    feature: featureToSort,
                    entries: await this.top(dim, featureToSort, threshold, filter)
                };
            } else if(count > highest) {
                highest = count;
                highestDim = dim;
            }
        }

        if(highestDim === null)
            return null;

        return {
            dimension: highestDim,
            feature: featureToSort,
            entries: await this.top(highestDim, featureToSort, threshold, filter)
        };
    }

    /**
     * Retrieve the number of entries in each leaderboard
     */
    async count(): Promise<MatrixCount> {
        let pipeline = this.client.pipeline();

        for(let dim of this.options.dimensions) {
            for(let feat of this.options.features) {
                let lb = this.getLeaderboard(dim.name, feat.name);
                pipeline.zcard(lb!.redisKey);
            }
        }

        let result: MatrixCount = { };
        let counts = await Leaderboard.execPipeline(pipeline);
        let i = 0;

        for(let dim of this.options.dimensions) {
            let dimCounts: { [feature: string]: number } = {};
            for(let feat of this.options.features)
                dimCounts[feat.name] = counts[i++];
            result[dim.name] = dimCounts;
        }

        return result;
    }
    
    /**
     * Execute and parse the result of a matrix script that uses sorting, it
     * checks the dimension/feature pair and ensures that it is not filtered out
     * 
     * @param fnName script to execute
     * @param filter filter to apply
     * @param dimensionToSort dimension to perform the sorting
     * @param featureToSort feature to perform the sorting
     * @param args extra arguments for the script
     */
    private execMatrixSort(fnName: string, filter: MatrixLeaderboardQueryFilter, dimensionToSort: DimensionName, featureToSort: FeatureName, ...args: any): Promise<MatrixEntry[]> {
        let sortLb = this.getLeaderboard(dimensionToSort, featureToSort);
        if(!sortLb)
            return Promise.resolve([]);

        // Check: the sort leaderboard must be in the filter list
        if(filter.dimensions?.length && !filter.dimensions.includes(dimensionToSort))
            filter.dimensions.push(dimensionToSort);
        if(filter.features?.length && !filter.features.includes(featureToSort))
            filter.features.push(featureToSort);

        return this.execMatrix(fnName, filter, sortLb.redisKey as string, ...args);
    }

    /**
     * Execute and parse the result of a matrix script
     * 
     * @param fnName script to execute
     * @param filter filter to apply
     * @param sortKey sorting key (if apply)
     * @param args extra arguments for the script
     */
    private async execMatrix(fnName: string, filter: MatrixLeaderboardQueryFilter, sortKey: string | null, ...args: any): Promise<MatrixEntry[]> {
        let queryInfo = this.getQueryInfo(filter);
        if(!queryInfo)
            return [];
    
        // @ts-ignore
        let result = await this.client[fnName](
            queryInfo.keys.length,
            queryInfo.keys,
            
            queryInfo.sortPolicies,
            sortKey ? queryInfo.keys.indexOf(sortKey) + 1 : -1,
            ...args
        );

        // parse and filter NULLs
        let entries: MatrixEntry[] = [];
        for(let r of result) {
            let e = this.parseEntry(r, queryInfo);
            if(e) entries.push(e);
        }
        return entries;
    }

    /**
     * Parse the result of the function `retrieveEntry` to MatrixEntry
     * 
     * @param data result of `retrieveEntry`
     * @param info query information
     */
    private parseEntry(data: any[], info: QueryInfo): MatrixEntry | null {
        //if(data.length < 1 + 2 * info.dimensions.length * info.features.length)
        //    return null;
        let i = 0;
        let valid = false;

        let result: MatrixEntry = {
            id: data[i++],
            ranks: {},
            scores: {}
        };
        
        for(let dim of info.dimensions) {
            let empty = true;
            let scores: { [feature: string]: Score } = {};
            let ranks: { [feature: string]: Rank } = {};

            for(let feat of info.features) {
                let score = parseFloat(data[i++]);

                if(!isNaN(score)) {
                    scores[feat] = score;
                    ranks[feat] = parseInt(data[i++]) + 1;
                    valid = true;
                    empty = false;
                } else
                    i++; // skip null score
            }

            if(!empty) {
                result.scores[dim] = scores;
                result.ranks[dim] = ranks;
            }
        }

        return valid ? result : null;
    }

    /**
     * Generates an object with settings to execute matrix queries
     * 
     * Note: this object cannot be cached because periodic leaderboards may
     * change the keys anytime
     * 
     * @param filter filter to apply
     */
    private getQueryInfo(filter: MatrixLeaderboardQueryFilter): QueryInfo | null {
        let result: QueryInfo = {
            features: [],
            dimensions: [],
            keys: [],
            sortPolicies: []
        };

        // only filtered or all
        result.dimensions = filter.dimensions || this.allDimensions;
        result.features = filter.features || this.allFeatures;

        for(let dim of result.dimensions) {
            for(let feat of this.options.features) {
                if(filter.features?.length && !filter.features.includes(feat.name))
                    continue; // filtered
                
                let lb = this.getLeaderboard(dim, feat.name);

                // Note: we throw in this assertion instead of continue
                // to ensure featureKeys match the order of this.options.features
                /* istanbul ignore next */
                if(!lb) throw new Error("Assertion: Leaderboard should exist");
                
                result.keys.push(lb.redisKey);
                result.sortPolicies.push(feat.options.sortPolicy);
            }
        }

        if(result.keys.length === 0)
            return null;

        return result;
    }
}