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
     * Set a score
     */
    async set(id: ID, score: number): Promise<void> {
        await this.client.zadd(this.options.path, score.toString(), id);
    }
    
    /**
     * Removes an entry from the leaderboard
     */
    async drop(id: ID): Promise<void> {
        await this.client.zrem(this.options.path, id);
    }

    /**
     * Retrieve the score of an entry
     */
    async score(id: ID): Promise<number | null> {
        let result = await this.client.zscore(this.options.path, id);
        return result === null ? null : parseInt(result, 10);
    }

    /**
     * Retrieve the one-based rank of an entry
     */
    async rank(id: ID): Promise<number | null> {
        let result = await this.client[this.options.lowToHigh ? 'zrank' : 'zrevrank'](this.options.path, id);
        return result === null ? null : result+1;
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
