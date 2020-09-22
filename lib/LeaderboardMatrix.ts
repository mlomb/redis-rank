import { Redis, KeyType, Pipeline } from 'ioredis';
import { Leaderboard, LeaderboardOptions, ID, Rank, Score, SortPolicy } from './Leaderboard';
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

export type MatrixEntryUpdateQuery = {
    id: ID,
    values: { [ feature: string ]: number | Score }
}

export type MatrixLeaderboardQueryFilter = {
    /** filter dimensions */
    dimensions?: DimensionName[],
    /** filter features */
    features?: FeatureName[]
};

/** internal query description */
type QueryInfo = {
    dimensions: DimensionName[],
    features: FeatureName[],
    keys: KeyType[],
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
     * update policies of each leaderboard in the matrix.
     * 
     * @param entries entry or list of entries to update
     * @param dimensions filter the update to only this dimensions. If not provided, all dimensions will be updated
     */
    update(entries: MatrixEntryUpdateQuery | MatrixEntryUpdateQuery[], dimensions?: DimensionName[]): Promise<any> {
        if (!Array.isArray(entries))
            entries = [entries];

        if(!dimensions)
            dimensions = this.options.dimensions.map(x => x.name);

        let pipeline: Pipeline = this.client.pipeline();

        for(let dim of dimensions) {
            for(let feat of this.options.features) {
                let updates = entries
                    .map(e => ({ id: e.id, value: e.values[feat.name] }))
                    .filter(e => e.value !== undefined);
                if(updates.length) {
                    let lb = this.getLeaderboard(dim, feat.name);
                    if(lb) {
                        lb.updatePipe(updates, pipeline);
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
                    pipeline.zrem(lb.redisKey, ids);
            }
        }

        await pipeline.exec();
    }

    /**
     * Retrieve an entry. If it doesn't exist, it returns null.
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
    async list(dimensionToSort: DimensionName, featureToSort: FeatureName, lower: Rank, upper: Rank, filter: MatrixLeaderboardQueryFilter = {}): Promise<MatrixEntry[]> {
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
    async around(dimensionToSort: DimensionName, featureToSort: FeatureName, id: ID, distance: number, fillBorders: boolean = false, filter: MatrixLeaderboardQueryFilter = {}) {
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