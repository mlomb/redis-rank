import { Redis, KeyType, Commands, Pipeline } from 'ioredis';
import { extendRedisClient } from './Common';

/** Entry identifier */
export type ID = string;
/** Score value */
export type Score = number;
/** Position in the leaderboard, determined by the sort policy. 1-based */
export type Rank = number;

/**
 * Sort policy
 * 
 * * `high-to-low`: sort scores in descending order
 * * `low-to-high`: sort scores in ascending order
 */
export type SortPolicy = 'high-to-low' | 'low-to-high';

/**
 * Update policy
 * 
 * When an update occurs...
 * * `replace`: the new score will replace the previous one
 * * `aggregate`: old and new scores will be added
 * * `best`: the best score is kept (determined by the sort policy)
 */
export type UpdatePolicy = 'replace' | 'aggregate' | 'best';

export type LeaderboardOptions = {
    /**
     * Redis key for the sorted set.
     * You can use any sorted set, not only the ones created by redis-rank
     */
    redisKey: KeyType,
    /**
     * Sort policy for this leaderboard
     * @see SortPolicy
     */
    sortPolicy: SortPolicy,
    /**
     * Update policy for this leaderboard
     * @see UpdatePolicy
     */
    updatePolicy: UpdatePolicy,
    /**
     * Keep only the top N entries, determined by the sort policy.
     * This lets you limit the number of entries stored, thus saving memory
     * 
     * If it is not specified, or the value is `0`, it means that there is
     * no limit
     */
    limitTopN?: number
}

/**
 * Entry details at the time of the query
 */
export type Entry = {
    id: ID,
    score: Score,
    rank: Rank
}

export type EntryUpdateQuery = {
    id: ID,
    value: number | Score
}

export class Leaderboard {

    private readonly client: Redis;
    private readonly options: LeaderboardOptions;

    /**
     * Create a new leaderboard
     * 
     * Note: the Redis key will not be created until an entry is inserted
     * (aka lazy)
     * 
     * @param client ioredis client
     * @param options leaderboard options
     */
    constructor(client: Redis, options: LeaderboardOptions) {
        this.client = client;
        this.options = options;

        extendRedisClient(this.client);
    }

    /**
     * Retrieve the number of entries in the leaderboard
     * 
     * Complexity: `O(1)`
     */
    count(): Promise<number> {
        return this.client.zcard(this.options.redisKey);
    }

    /**
     * Remove all the entries from the leaderboard
     * 
     * Note: it will delete the underlying Redis key
     * 
     * Complexity: `O(N)` where N is the number of entries in the leaderboard
     */
    async clear() {
        await this.client.del(this.options.redisKey);
    }

    /**
     * Retrieves the score of an entry. If it doesn't exist, it returns null
     * 
     * Complexity: `O(1)`
     * 
     * @param id entry id
     */
    async score(id: ID): Promise<Score | null> {
        let score = await this.client.zscore(this.options.redisKey, id);
        return score === null ? null : parseFloat(score);
    }

    /**
     * Retrieves the rank of an entry. If it doesn't exist, it returns null.
     * 1-based
     * 
     * Complexity: `O(log(N))` where N is the number of entries in the
     *             leaderboard
     * 
     * @param id entry id
     */
    async rank(id: ID): Promise<Rank | null> {
        let rank = await (this.options.sortPolicy === 'high-to-low' ?
            this.client.zrevrank(this.options.redisKey, id) :
            this.client.zrank(this.options.redisKey, id));
        return rank === null ? null : (rank+1);
    }

    /**
     * Retrieves an entry. If it doesn't exist, it returns null.
     * 
     * Complexity: `O(log(N))` where N is the number of entries in the
     *             leaderboard
     * 
     * @param id entry id
     */
    async find(id: ID): Promise<Entry | null> {
        let result = await (this.options.sortPolicy === 'high-to-low' ?
            // @ts-ignore
            this.client.zrevfind(this.options.redisKey, id) :
            // @ts-ignore
            this.client.zfind(this.options.redisKey, id));

        return (result[0] === false || result[1] === false || result[0] === null || result[1] === null) ? null : {
            id: id,
            score: parseFloat(result[0]),
            rank: result[1]+1
        };
    }

    /**
     * Update one entry. If the entry does not exists, it will be created.
     * The update behaviour is determined by the sort and update policies.
     * 
     * Complexity: `O(log(N))` where N is the number of entries in the
     * leaderboard
     * 
     * @param id entry id
     * @param value amount or score
     * @returns if the update policy is `aggregate` or `best` then the final
     * score otherwise void
     */
    async updateOne(id: ID, value: Score | number): Promise<Score | void> {
        return (await this.update([{ id, value }]))[0];
    }

    /**
     * Update one or more entries. If one of the entries does not exists,
     * it will be created. The update behaviour is determined by the sort and
     * update policies.
     * 
     * Complexity: `O(log(N))` for each entry updated, where N is the number of
     * entries in the leaderboard
     * 
     * @param entries entry or list of entries to update
     * @returns if the update policy is `aggregate` or `best` then the final
     * score for each entry otherwise void
     */
    async update(entries: EntryUpdateQuery | EntryUpdateQuery[]): Promise<Score[] | void[]> {
        if (!Array.isArray(entries))
            entries = [entries];
        
        let pipeline = this.client.pipeline();
        this.updatePipe(entries, pipeline);
        this.postInsert(pipeline);
        return (await Leaderboard.execPipeline(pipeline)).map(parseFloat);
    }

    /**
     * Uses IORedis.Pipeline to batch multiple redis commands
     * 
     * @see update  
     * @param entries list of entries to update
     * @param pipeline ioredis pipeline
     */
    updatePipe(entries: EntryUpdateQuery[], pipeline: Pipeline) {
        let fn: any = null;

        switch (this.options.updatePolicy) {
            case 'replace': fn = pipeline.zadd.bind(pipeline); break;
            case 'aggregate': fn = pipeline.zincrby.bind(pipeline); break;
            case 'best':
                fn = this.options.sortPolicy === 'high-to-low' ?
                    // @ts-ignore
                    pipeline.zrevbest.bind(pipeline) :
                    // @ts-ignore
                    pipeline.zbest.bind(pipeline);
                break;
        }

        for (let entry of entries)
            fn(this.options.redisKey, entry.value, entry.id);
    }

    private postInsert(pipeline: Pipeline) {
        // TODO: check top N
    }
    
    static async execPipeline(pipeline: Pipeline): Promise<any[]> {
        let outputs = await pipeline.exec();
        let results = [];
        for(let [err, result] of outputs) {
            if(err) throw err;
            results.push(result);
        }
        return results;
    }
    
    public get redisClient(): Redis {
        return this.client;
    }
    
    public get redisKey(): KeyType {
        return this.options.redisKey;
    }

    public get sortPolicy(): SortPolicy {
        return this.options.sortPolicy;
    }
    
    public get updatePolicy(): UpdatePolicy {
        return this.options.updatePolicy;
    }
}
