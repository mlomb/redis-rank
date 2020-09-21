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

type QueryInfo = {
    dimensions: DimensionName[],
    features: FeatureName[],
    keys: KeyType[],
    sortPolicies: SortPolicy[]

    /** all features to retrive */
    //featureKeys: KeyType[],
    /** features sort policies */
    //featureSortPolicies: SortPolicy[],
    /** feature that will be used to sort the results */
    //mainFeatureIndex: number

}

type MatrixLeaderboardQueryFilter = {
    /** filter dimensions */
    dimensions?: DimensionName[],
    /** filter features */
    features?: FeatureName[]
};

export class LeaderboardMatrix {

    private readonly client: Redis;
    private readonly baseKey: string;
    private readonly options: LeaderboardMatrixOptions;
    private readonly matrix: { [key: string]: Leaderboard | PeriodicLeaderboard };

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
                this.matrix[key] =
                    dim.cycle ?
                        new PeriodicLeaderboard(client, redisKey, {
                            leaderboardOptions: feat.options,
                            now: options.now,
                            cycle: dim.cycle,
                        }) :
                        new Leaderboard(client, redisKey, feat.options);
            }
        }
    }

    /**
     * 
     * Note: returns null if the dimension/feature pair is invalid
     * 
     * @param dimension dimension name
     * @param feature feature name
     * @param time 
     */
    getLeaderboard(dimension: DimensionName, feature: FeatureName, time?: Date): Leaderboard | null {
        let key = `${dimension}:${feature}`;
        let lb = this.matrix[key];

        if(!lb) // invalid leaderboard
            return null;
        if(lb instanceof PeriodicLeaderboard)
            lb = lb.getLeaderboardAt(time);
        return lb;
    }

    async update(entries: MatrixEntryUpdateQuery | MatrixEntryUpdateQuery[], dimensions?: DimensionName[]) {
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

        await Leaderboard.execPipeline(pipeline);
    }

    async list(dimensionToSort: DimensionName, featureToSort: FeatureName, low: number, high: number, filter: MatrixLeaderboardQueryFilter = {}): Promise<MatrixEntry[]> {
        return this.execMatrixSort(
            'zmatrixrange',
            filter,
            dimensionToSort,
            featureToSort,
            Math.max(1, low) - 1,
            Math.max(1, high) - 1
        );
    }

    /**
     * Retrieve the top entries
     * 
     * @param max max number of entries to return
     */
    top(dimensionToSort: DimensionName, featureToSort: FeatureName, max: number = 10, filter: MatrixLeaderboardQueryFilter = {}): Promise<MatrixEntry[]> {
        return this.list(dimensionToSort, featureToSort, 1, max);
    }

    /**
     * Retrieve the entries around an entry
     * 
     * @see Leaderboard.around for details
     * @param dimension 
     * @param featureToSort 
     * @param id 
     * @param distance number of entries at each side of the queried entry
     * @param fillBorders include entries at the other side if the entry is too close to one of the borders.
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
    
    async find(id: ID, filter: MatrixLeaderboardQueryFilter = {}): Promise<MatrixEntry | null> {
        let result = await this.execMatrix('zmatrixfind', filter, null, id);
        return result.length ? result[0] : null;
    }

    private execMatrixSort(fnName: string, filter: MatrixLeaderboardQueryFilter, dimensionToSort: DimensionName, featureToSort: FeatureName, ...args: any): Promise<MatrixEntry[]> {
        let sortLb = this.getLeaderboard(dimensionToSort, featureToSort);
        if(!sortLb)
            return Promise.resolve([]);
        return this.execMatrix(fnName, filter, sortLb.redisKey as string, ...args);
    }

    /**
     * Execute and parse the result of a matrix script
     * 
     * @param fnName 
     * @param filter 
     * @param sortKey 
     * @param args 
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

        console.log(result);

        // parse and filter NULLs
        let entries: MatrixEntry[] = [];
        for(let r of result) {
            let e = this.parseEntry(r, queryInfo);
            if(e)
                entries.push(e);
        }
        return entries;
    }

    parseEntry(data: any[], info: QueryInfo): MatrixEntry | null {
        if(data.length < 1 + 2 * info.dimensions.length * info.features.length)
            return null;
        let i = 0;
        let valid = false;

        let result: MatrixEntry = {
            id: data[i++],
            ranks: {},
            scores: {}
        };
        
        for(let dim of info.dimensions) {
            let scores: { [feature: string]: Score } = {};
            let ranks: { [feature: string]: Rank } = {};

            for(let feat of info.features) {
                scores[feat] = parseFloat(data[i++]);
                ranks[feat] = parseInt(data[i++]) + 1;

                if(!valid && !isNaN(ranks[feat]))
                    valid = true;
            }

            result.scores[dim] = scores;
            result.ranks[dim] = ranks;
        }

        return valid ? result : null;
    }

    private getQueryInfo(filter: MatrixLeaderboardQueryFilter): QueryInfo | null {
        let result: QueryInfo = {
            features: [],
            dimensions: [],
            keys: [],
            sortPolicies: []
        };

        // only filtered or all
        result.dimensions = filter.dimensions || this.options.dimensions.map(d => d.name);
        result.features = filter.features || this.options.features.map(f => f.name);

        for(let dim of result.dimensions) {
            for(let feat of this.options.features) {
                if(filter.features?.length && !filter.features.includes(feat.name))
                    continue; // filtered
                
                let lb = this.getLeaderboard(dim, feat.name);

                // Note: we throw in this assertion instead of continue
                // to ensure featureKeys match the order of this.options.features
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