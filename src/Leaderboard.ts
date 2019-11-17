import { Redis, KeyType } from 'ioredis';

type ID = string;

type LeaderboardOptions = {
    /** sorted set key */
    path: KeyType,
    /** lower scores are better */
    lowToHigh: boolean
}

type Entry = {
    id: ID,
    score: number,
    rank: number
}

export default class Leaderboard {
    /** ioredis client */
    client: Redis;
    /** options */
    options: LeaderboardOptions;

    /**
     * Create a new leaderboard
     * @param client ioredis client
     * @param path path to the sorted set
     */
    constructor(client: Redis, options: Partial<LeaderboardOptions> = {}) {
        this.client = client;
        
        this.options = Object.assign({
            path: "lb",
            lowToHigh: false
        }, options);
    }

    /**
     * Create or update the score of an entry
     */
    async set(id: ID, score: number): Promise<void> {
        await this.client.zadd(this.options.path, score.toString(), id);
    }
    
    /**
     * Increment/decrement the score of an entry by an amount
     * If the entry does not exist, it is added with amount as the score
     * @returns the updated score
     */
    async incr(id: ID, amount: number): Promise<number> {
        let score = await this.client.zincrby(this.options.path, amount, id);
        return parseInt(score, 10);
    }
    
    /**
     * Removes an entry from the leaderboard
     */
    async drop(id: ID): Promise<void> {
        await this.client.zrem(this.options.path, id);
    }

    /**
     * Retrieve an entry from the leaderboard
     */
    async peek(id: ID): Promise<Entry | null> {
        let result = await this.client.eval(
            `return{` +
                `redis.call('zscore',KEYS[1],ARGV[1]),` +
                `redis.call('z${this.options.lowToHigh ? '' : 'rev'}rank',KEYS[1],ARGV[1])` +
            `}`, // 83 bytes vs 20 bytes using EVALSHA maybe worth it?
            1, this.options.path, id
        );

        return (result[0] === false || result[1] === false) ? null : {
            id: id,
            score: parseInt(result[0], 10),
            rank: result[1]+1
        };
    }

    /**
     * Retrieve the score of an entry
     */
    async score(id: ID): Promise<number | null> {
        let score = await this.client.zscore(this.options.path, id);
        return score === null ? null : parseInt(score, 10);
    }

    /**
     * Retrieve the one-based rank of an entry
     */
    async rank(id: ID): Promise<number | null> {
        let rank = await this.client[this.options.lowToHigh ? 'zrank' : 'zrevrank'](this.options.path, id);
        return rank === null ? null : rank+1;
    }

    /**
     * Retrieve the entries ranked between some boundaries (one-based)
     * @param low lower bound to query (inclusive)
     * @param high higher bound to query (inclusive)
     */
    async list(low: number, high: number): Promise<Entry[]> {
        if(low < 1 || high < 1) throw new Error("Out of bounds");
        if(low > high) throw new Error(`high must be greater than low (${low} <= ${high})`);

        let result = await this.client[this.options.lowToHigh ? 'zrange' : 'zrevrange'](this.options.path, low-1, high-1, 'WITHSCORES');
        let entries: Entry[] = [];

        let rank = low;
        for (let i = 0; i < result.length; i += 2) {
            entries.push({
                id: result[i],
                score: parseInt(result[i + 1], 10),
                rank: rank++
            });
        }

        return entries;
    }
    
    /**
     * Retrieve the top entries
     * This function is an alias for list(1, max)
     * @param max max number of entries to return
     */
    async top(max: number = 10): Promise<Entry[]> {
        return this.list(1, max);
    }
}
