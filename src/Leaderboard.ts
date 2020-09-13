import { Redis, KeyType, Pipeline } from 'ioredis';
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

    readonly client: Redis;
    readonly options: LeaderboardOptions;

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
     * Update entries. If one of the entries does not exists, it will be created
     * 
     * Complexity: `O(log(N))` for each entry added, where N is the number of
     *             entries in the leaderboard
     * 
     * @param entries list of entries to update
     */
    async update(entries: EntryUpdateQuery | EntryUpdateQuery[]): Promise<void> {
        if (!Array.isArray(entries))
            entries = [entries];

        const pipeline = this.client.pipeline();
        this.updateMulti(entries, pipeline);
        let r = await pipeline.exec();
        //console.log(r);
        // TODO: handle errors
    }


    /**
     * Set/replace the score of an entry. Ignores the update policy
     * 
     * Complexity: `O(log(N))` where N is the number of entries in the
     *             leaderboard
     * 
     * @param id entry id
     * @param score new score for entry
     */
    async replace(id: ID, score: Score): Promise<void> {
        await this.client.zadd(this.options.redisKey, score, id);
    }

    replaceMulti(update: EntryUpdateQuery, pipeline: Pipeline) {
        pipeline.zadd(this.options.redisKey, update.value as any, update.id);
    }

    /**
     * Increment the score of an entry. Ignores the update policy.  
     * If the entry doesn't exist, it creates it with `value` as score
     * 
     * Complexity: `O(log(N))` where N is the number of entries in the
     *             leaderboard
     * 
     * @param id entry id
     * @param value amount to increment
     * @returns the updated score
     */
    async incr(id: ID, value: number): Promise<Score> {
        let new_score = await this.client.zincrby(this.options.redisKey, value, id);
        return parseFloat(new_score);
    }

    incrMulti(update: EntryUpdateQuery, pipeline: Pipeline) {
        pipeline.zincrby(this.options.redisKey, update.value as any, update.id);
    }

    /**
     * Updates the score of an entry only if the provided value is _better_
     * than the stored one. If the entry doesn't exist, it is created
     * 
     * Note: a score is considered better depending on the sort policy
     * 
     * Complexity: `O(log(N))` where N is the number of entries in the
     *             leaderboard
     * 
     * @param id entry id
     * @param score new score for entry
     * @returns whether the score has been updated
     */
    async best(id: ID, score: Score): Promise<boolean> {
        let result = await (this.options.sortPolicy === 'high-to-low' ?
            // @ts-ignore
            this.client.zrevbest(this.options.redisKey, score, id) :
            // @ts-ignore
            this.client.zbest(this.options.redisKey, score, id));
        return result === 1 || result === '1'; // just in case we check both
    }

    bestMulti(update: EntryUpdateQuery, pipeline: Pipeline) {
        if(this.options.sortPolicy === 'high-to-low')
            // @ts-ignore
            pipeline.zrevbest(this.options.redisKey, update.value, update.id);
        else
            // @ts-ignore
            pipeline.zbest(this.options.redisKey, update.value, update.id);
    }
    
    async update(update: EntryUpdateQuery | EntryUpdateQuery[]) {
        switch (this.options.updatePolicy) {
            case 'replace':
                this.replace(update.id, update.value);
        }
    }
    
    /**
     * Uses IORedis.Pipeline to batch multiple update commands
     * 
     * @see update
     */
    updateMulti(entries: EntryUpdateQuery[], pipeline: Pipeline) {
        const key = this.options.redisKey;
        
        switch (this.options.updatePolicy) {
            case 'replace':
                for (let entry of entries)
                    pipeline.zadd(key, entry.value as any, entry.id);
                break;
            case 'aggregate':
                for (let entry of entries)
                    pipeline.zincrby(key, entry.value, entry.id);
                break;
            case 'best':
                for (let entry of entries) {
                    if(this.options.sortPolicy === 'high-to-low')
                        // @ts-ignore
                        pipeline.zrevbest(key, entry.value, entry.id);
                    else
                        // @ts-ignore
                        pipeline.zbest(key, entry.value, entry.id);
                }
                break;
        }
    }

}
