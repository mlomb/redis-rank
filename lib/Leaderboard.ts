import { Redis, KeyType, Pipeline } from 'ioredis';
import { extendRedisClient } from './Commands';

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
     * If not specified, or the value is `0`, then there is no limit
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
    private readonly key: KeyType;
    private readonly options: LeaderboardOptions;

    /**
     * Create a new leaderboard
     * 
     * Note: the Redis key will not be created until an entry is inserted
     * (aka lazy)
     * 
     * @param client ioredis client
     * @param key Redis key for the sorted set. You can use any sorted set, not only the ones created by redis-rank
     * @param options leaderboard options
     */
    constructor(client: Redis, key: KeyType, options: LeaderboardOptions) {
        this.client = client;
        this.key = key;
        this.options = options;

        extendRedisClient(this.client);
    }

    /**
     * Retrieve the score of an entry. If it doesn't exist, it returns null
     * 
     * Complexity: `O(1)`
     * 
     * @param id entry id
     */
    async score(id: ID): Promise<Score | null> {
        let score = await this.client.zscore(this.key, id);
        return score === null ? null : parseFloat(score);
    }

    /**
     * Retrieve the rank of an entry. If it doesn't exist, it returns null.
     * 
     * Complexity: `O(log(N))` where N is the number of entries in the
     *             leaderboard
     * 
     * @param id entry id
     */
    async rank(id: ID): Promise<Rank | null> {
        let rank = await (this.options.sortPolicy === 'high-to-low' ?
            this.client.zrevrank(this.key, id) :
            this.client.zrank(this.key, id));
        return rank === null ? null : (rank + 1);
    }

    /**
     * Retrieve an entry. If it doesn't exist, it returns null.
     * 
     * Complexity: `O(log(N))` where N is the number of entries in the
     *             leaderboard
     * 
     * @param id entry id
     */
    async find(id: ID): Promise<Entry | null> {
        let result = await (this.options.sortPolicy === 'high-to-low' ?
            // @ts-ignore
            this.client.zrevfind(this.key, id) :
            // @ts-ignore
            this.client.zfind(this.key, id));

        return (result[0] === false || result[1] === false || result[0] === null || result[1] === null) ? null : {
            id: id,
            score: parseFloat(result[0]),
            rank: result[1] + 1
        };
    }

    /**
     * Retrieve an entry at a specific rank. If the rank is out of bounds,
     * it returns null.
     * 
     * Complexity: `O(log(N))` where N is the number of entries in the
     *             leaderboard
     * 
     * Note: This function is an alias for list(rank, rank)[0]
     * 
     * @param rank rank to query
     */
    async at(rank: Rank): Promise<Entry | null> {
        if(rank <= 0)
            return null;
        let result = await this.list(rank, rank);
        return result.length == 0 ? null : result[0];
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
     * @param updatePolicy override the default update policy only for this update
     * @returns if the update policy is `aggregate` or `best` then the final
     * score otherwise void
     */
    async updateOne(id: ID, value: Score | number, updatePolicy?: UpdatePolicy): Promise<Score | void> {
        return (await this.update([{ id, value }], updatePolicy))[0];
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
     * @param updatePolicy override the default update policy only for this update
     * @returns if the update policy is `aggregate` or `best` then the final
     * score for each entry otherwise void
     */
    async update(entries: EntryUpdateQuery | EntryUpdateQuery[], updatePolicy?: UpdatePolicy): Promise<Score[] | void[]> {
        if (!Array.isArray(entries))
            entries = [entries];

        let pipeline = this.client.pipeline();
        this.updatePipe(entries, pipeline, updatePolicy);
        return (await this.execPipelineAndLimit(pipeline)).map(parseFloat);
    }

    limitPipe(pipeline: Pipeline): boolean {
        let limited = (this.options.limitTopN && this.options.limitTopN > 0) as boolean;
        if(limited) {
            if(this.options.sortPolicy === 'high-to-low')
                // @ts-ignore
                pipeline.zrevkeeptop(this.key, this.options.limitTopN);
            else
                // @ts-ignore
                pipeline.zkeeptop(this.key, this.options.limitTopN)
        }
        return limited;
    }

    private async execPipelineAndLimit(pipeline: Pipeline) {
        let limited = this.limitPipe(pipeline);
        let result = await Leaderboard.execPipeline(pipeline);
        return limited ? result.slice(0, -1) : result;
    }

    /**
     * Uses IORedis.Pipeline to batch multiple redis commands
     * 
     * Note: this method alone will not honor `limitTopN`
     * 
     * @see update  
     * @param entries list of entries to update
     * @param pipeline ioredis pipeline
     * @param updatePolicy override the default update policy only for this update
     */
    updatePipe(entries: EntryUpdateQuery[], pipeline: Pipeline, updatePolicy?: UpdatePolicy) {
        let fn: any = null;

        switch (updatePolicy || this.options.updatePolicy) {
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
            fn(this.key, entry.value, entry.id);
    }

    /**
     * Remove one or more entries from the leaderboard
     * 
     * Complexity: `O(M*log(N))` where N is the number of entries in the
     * leaderboard and M the number of entries to be removed
     */
    async remove(ids: ID | ID[]): Promise<void> {
        await this.client.zrem(this.key, ids);
    }
    
    /**
     * Remove all the entries from the leaderboard
     * 
     * Note: it will delete the underlying Redis key
     * 
     * Complexity: `O(N)` where N is the number of entries in the leaderboard
     */
    async clear(): Promise<void> {
        await this.client.del(this.key);
    }

    /**
     * Retrieve entries between ranks
     * 
     * Complexity: `O(log(N)+M)` where N is the number of entries in the
     *             leaderboard and M the number of entries returned
     * 
     * @param low lower bound to query (inclusive)
     * @param high higher bound to query (inclusive)
     */
    async list(low: Rank, high: Rank): Promise<Entry[]> {
        let result = await this.client[this.options.sortPolicy === 'low-to-high' ? 'zrange' : 'zrevrange'](
            this.key,
            Math.max(low, 1) - 1,
            Math.max(high, 1) - 1,
            'WITHSCORES'
        );
        let entries: Entry[] = [];

        let rank = low;
        for (let i = 0; i < result.length; i += 2) {
            entries.push({
                id: result[i],
                score: parseFloat(result[i + 1]),
                rank: rank++
            });
        }

        return entries;
    }
    
    /**
     * Retrieve the top entries
     * 
     * Complexity: `O(log(N)+M)` where N is the number of entries in the
     *             leaderboard and M is `max`
     * 
     * Note: This function is an alias for list(1, max)
     * 
     * @param max number of entries to return
     */
    top(max: number = 10): Promise<Entry[]> {
        return this.list(1, max);
    }
    
    /**
     * Retrieve the bottom entries (from worst to better)
     * 
     * Complexity: `O(log(N)+M)` where N is the number of entries in the
     *             leaderboard and M is `max`
     * 
     * @param max number of entries to return
     */
    async bottom(max: number = 10): Promise<Entry[]> {
        let pipeline = this.client.pipeline();
        pipeline.zcard(this.redisKey);
        pipeline[this.options.sortPolicy === 'low-to-high' ? 'zrange' : 'zrevrange'](
            this.key,
            -Math.max(1, max),
            -1,
            'WITHSCORES'
        );
        let results = await Leaderboard.execPipeline(pipeline);
        
        let entries: Entry[] = [];

        let list: any[] = results[1];
        let rank: Rank = results[0] - list.length + 1;
        for (let i = 0; i < list.length; i += 2) {
            entries.push({
                id: list[i],
                score: parseFloat(list[i + 1]),
                rank: rank++,
            });
        }

        return entries.reverse();
    }
    
    /**
     * Retrieve the entries around an entry
     * 
     * Example with distance = 4:
     * ```
     * +-----+-----+-----+-----+-----+-----+-----+-----+-----+------+
     * | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th | 9th | 10th |
     * +-----+-----+-----+-----+-----+-----+-----+-----+-----+------+
     *               ↑
     *         queried entry
     * 
     * Without fillBorders: [ 1st, 2nd, 3rd, 4th, 5th, 6th, 7th ] // 2 + 1 + 4 = 7 elements
     * With fillBorders:    [ 1st, 2nd, 3rd, 4th, 5th, 6th, 7th, 8th, 9th ] // 2 + 1 + 6 = 9 elements
     * ```
     * 
     * Complexity: `O(log(N)+M)` where N is the number of entries in the
     *             leaderboard and M is 2*`distance`+1
     * 
     * @param id id of the entry at the center
     * @param distance number of entries at each side of the queried entry
     * @param fillBorders whether to include entries at the other side if the
     * entry is too close to one of the borders. In other words, it always
     * makes sure to return at least 2*`distance`+1 entries (if there are enough
     * in the leaderboard)
     */
    async around(id: ID, distance: number, fillBorders: boolean = false): Promise<Entry[]> {
        //@ts-ignore
        let result = await this.client.zaround(
            this.key,
            id,
            Math.max(distance, 0),
            (fillBorders === true).toString(),
            this.options.sortPolicy
        );

        let entries: Entry[] = [];
        let rank = 0;
        for (let i = 0; i < result[1].length; i += 2) {
            entries.push({
                id: result[1][i],
                score: parseFloat(result[1][i + 1]),
                rank: 1 + result[0] + rank++
            });
        }

        return entries;
    }

    /**
     * Use ZSCAN
     * O(1) for each call. O(N) for a complete iteration.
     */
    exportUnordered() {
        
    }

    /**
     * Use ZRANGE
     * O(log(N)+M)
     */
    exportOrdered() {

    }

    /**
     * Retrieve the number of entries in the leaderboard
     * 
     * Complexity: `O(1)`
     */
    count(): Promise<number> {
        return this.client.zcard(this.key);
    }

    public get redisClient(): Redis {
        return this.client;
    }

    public get redisKey(): KeyType {
        return this.key;
    }

    public get sortPolicy(): SortPolicy {
        return this.options.sortPolicy;
    }

    public get updatePolicy(): UpdatePolicy {
        return this.options.updatePolicy;
    }

    static async execPipeline(pipeline: Pipeline): Promise<any[]> {
        let outputs = await pipeline.exec();
        let results = [];
        for (let [err, result] of outputs) {
            /* istanbul ignore next */
            if (err) throw err;
            results.push(result);
        }
        return results;
    }
}
