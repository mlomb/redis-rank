import { Redis, KeyType } from 'ioredis';

export type ID = string;

export type LeaderboardOptions = {
    /** sorted set key */
    path: KeyType,
    /** lower scores are better */
    lowToHigh: boolean
}

export type Entry = {
    id: ID,
    score: number,
    rank: number
}

export default class Leaderboard {
    /** ioredis client */
    private client: Redis;
    /** options */
    private options: LeaderboardOptions;

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
    async add(id: ID, score: number): Promise<void> {
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
    remove(id: ID): Promise<void> {
        return this.client.zrem(this.options.path, id);
    }
    
    /**
     * Remove all the entries
     */
    async clear(): Promise<void> {
        await this.client.del(this.options.path);
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

        return (result[0] === false || result[1] === false || result[0] === null || result[1] === null) ? null : {
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
    top(max: number = 10): Promise<Entry[]> {
        return this.list(1, max);
    }
    
    /**
     * Retrieve the entry at a specific rank
     * This function is an alias for list(rank, rank)[0]
     * @param rank rank to query
     */
    async at(rank: number): Promise<Entry | null> {
        if(rank <= 0)
            return null;
        let result = await this.list(rank, rank);
        return result.length == 0 ? null : result[0];
    }

    /**
     * Retrieve the entries around an entry
     * 
     * Example with distance = 4:
     * ```
     * +-----+-----+-----+-----+-----+-----+-----+-----+-----+------+
     * | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th | 9th | 10th |
     * +-----+-----+-----+-----+-----+-----+-----+-----+-----+------+
     *                ↑
     *         queried entry
     * 
     * Without fillBorders: [ 1st, 2nd, 3rd, 4th, 5th, 6th, 7th ] // 2 + 1 + 4 = 7 elements
     * With fillBorders:    [ 1st, 2nd, 3rd, 4th, 5th, 6th, 7th, 8th, 9th ] // 2 + 1 + 6 = 9 elements
     * ```
     * 
     * @param distance number of entries at each side of the queried entry
     * @param fillBorders whether to include entries at the other side if the entry
     *                    is too close to one of the borders. In other words, it always
     *                    makes sure to have at lease 2*distance+1 entries (if there are
     *                    enough in the leaderboard)
     */
    async around(id: ID, distance: number, fillBorders: boolean = false): Promise<Entry[]> {
        if(distance < 0)
            return [];

        let result = await this.client.eval(
            `local r=redis.call('z${this.options.lowToHigh ? '' : 'rev'}rank',KEYS[1],ARGV[1])` +
            `if r==false then return{0,{}} end ` +
            `local c=redis.call('zcard',KEYS[1])` +
            `local l=math.max(0, r-ARGV[2])` +
            (fillBorders ?
                `local h=l+2*ARGV[2]` +
                `if h>c then ` +
                    `h=math.min(c, r+ARGV[2])` +
                    `l=math.max(0,h-2*ARGV[2]-1)` +
                `end `
                :
                `local h=math.min(c, r+ARGV[2])`
            ) +
            `return{l,redis.call('z${this.options.lowToHigh ? '' : 'rev'}range',KEYS[1],l,h,'WITHSCORES')}`,
            // 289 bytes vs 20 bytes using EVALSHA should consider it
            1, this.options.path, id, distance
        );

        let entries: Entry[] = [];
        let rank = 0;
        for (let i = 1; i < result[1].length; i += 2) {
            entries.push({
                id: result[1][i],
                score: parseInt(result[1][i + 1], 10),
                rank: 1 + result[0] + rank++
            });
        }

        return entries;
    }

    /**
     * Retrieve the the total number of entries
     */
    total(): Promise<number> {
        return this.client.zcard(this.options.path);
    }
}
