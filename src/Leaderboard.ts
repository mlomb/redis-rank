import { Redis, KeyType, Pipeline } from 'ioredis';

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
 * * `best`: the best score is kept (determined by the sort policy)
 * * `aggregate`: old and new scores will be added
 * * `replace`: the new score will replace the previous one
 */
export type UpdatePolicy = 'best' | 'aggregate' | 'replace';

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
     * If its not specified, or the value is `0`, it means there is no limit
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
    value: Score
}

export class Leaderboard {

    readonly client: Redis;
    readonly options: LeaderboardOptions;

    /**
     * Create a new leaderboard
     * 
     * @param client ioredis client
     * @param options leaderboard options
     */
    constructor(client: Redis, options: LeaderboardOptions) {
        this.client = client;
        this.options = options;
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
     * Retrieves the rank of an entry. If it doesn't exist, it returns null
     * 
     * Complexity: `O(log(N))` where N is the number of entries in the
     *             leaderboard
     * 
     * @param id entry id
     */
    rank(id: ID): Promise<Rank | null> {
        return this.options.sortPolicy === 'high-to-low' ?
            this.client.zrank(this.options.redisKey, id) :
            this.client.zrevrank(this.options.redisKey, id);
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
        await pipeline.exec();
    }

    /**
     * Uses IORedis.Pipeline to batch multiple update commands
     * 
     * @see update
     */
    updateMulti(entries: EntryUpdateQuery[], pipeline: Pipeline) {
        switch (this.options.updatePolicy) {
            case 'replace':
                for (let entry of entries)
                    pipeline.zadd(this.options.redisKey, entry.value as any, entry.id);
                break;
            case 'aggregate':
                for (let entry of entries)
                    pipeline.zincrby(this.options.redisKey, entry.value, entry.id);
                break;
            case 'best':
                for (let entry of entries) {
                    pipeline.zadd(this.options.redisKey, entry.value as any, entry.id);
                }
                break;
        }
    }
}
