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

    /*
    async list(dimension: DimensionName, featureToSort: FeatureName, low: number, high: number): Promise<MatrixEntry[]> {
        if(low < 1 || high < 1) throw new Error("Out of bounds (<1)");
        if(low > high) throw new Error(`high must be greater than low (${low} <= ${high})`);

        let queryInfo = this.getQueryInfo(dimension, featureToSort);
        if(!queryInfo)
            return [];

        // @ts-ignore
        let result = await (queryInfo.featureSortPolicy === 'low-to-high' ? this.client.zmultirange : this.client.zrevmultirange).bind(this.client)(
            queryInfo.featureKeys.length + 1,
            queryInfo.featureSortKey,
            queryInfo.featureKeys,

            low - 1,
            high - 1,
            queryInfo.featureKeys.length
        );

        return this.parseEntries(result, low);
    }

    /**
     * Retrieve the top entries
     * 
     * @param max max number of entries to return
     * /
    top(dimension: DimensionName, featureToSort: FeatureName, max: number = 10): Promise<MatrixEntry[]> {
        return this.list(dimension, featureToSort, 1, max);
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
     * /
    async around(dimension: DimensionName, featureToSort: FeatureName, id: ID, distance: number, fillBorders: boolean = false) {
        let queryInfo = this.getQueryInfo(dimension, featureToSort);
        if(!queryInfo)
            return [];

        let result = await (queryInfo.featureSortPolicy === 'high-to-low' ?
            // @ts-ignore
            this.client.zrevmultiaround :
            // @ts-ignore
            this.client.zmultiaround
        ).bind(this.client)(
            queryInfo.featureKeys.length + 1,
            queryInfo.featureSortKey,
            queryInfo.featureKeys,

            id,
            Math.max(distance, 0),
            (fillBorders === true).toString(),
            queryInfo.featureKeys.length
        );

        return this.parseEntries(result[1], parseInt(result[0]) + 1);
    }
    */

    async find(id: ID, filter: MatrixLeaderboardQueryFilter = {}): Promise<MatrixEntry | null> {
        let queryInfo = this.getQueryInfo(filter);
        if(!queryInfo)
            return null;

        console.log(queryInfo);

        // @ts-ignore
        let result = await this.client.zmultifind(
            queryInfo.keys.length,
            queryInfo.keys,
            
            id,
            [queryInfo.sortPolicies]
        );

        console.log(result);

        return null;
    }

    /**
     * Parses the result of the Lua function 'retrieveEntries'
     * 
     * @param data result of retrieveEntries
     * @param low rank of the first entry
     */
    private parseEntries(result: any, low: Rank): MatrixEntry[] {
        return result[0].map((id: ID, index: number) => ({
            id,
            rank: low + index,
            scores: this.options.features.reduce((scores: any, feature, f_i) => {
                scores[feature.name] = parseFloat(result[1][f_i][index])
                return scores;
            }, {})
        }));
    }

    /*
    private getQueryInfo(dimension: DimensionName, featureToSort: FeatureName): QueryInfo | null {
        let result: QueryInfo = {
            featureKeys: [],
            featureSortPolicies: [],
            mainFeatureIndex: -1
        }

        let i = 0;
        for(let feat of this.options.features) {
            let lb = this.getLeaderboard(dimension, feat.name);

            // Note: we throw in this assertion instead of continue
            // to ensure featureKeys match the order of this.options.features
            if(!lb) throw new Error("Assertion: Leaderboard should exist");
            
            if(feat.name === featureToSort)
                result.mainFeatureIndex = i;

            result.featureKeys.push(lb.redisKey);
            result.featureSortPolicies.push(lb.sortPolicy);

            i++;
        }

        if(result.mainFeatureIndex < 0)
            return null;

        return result;
    }
    */

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