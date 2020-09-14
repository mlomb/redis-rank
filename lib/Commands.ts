import { Redis } from "ioredis";

// old code, yet to migrate
`
local function slice(array, start, finish)
    local t = {}
    for k = start, finish do
        t[#t+1] = array[k]
    end
    return t
end

local function retrieveEntry(id, feature_keys)
    local features = {}

    while #feature_keys > 0 do
        local key = table.remove(feature_keys, 1)
        features[#features+1] = redis.call('ZSCORE', key, id)
    end

    return features
end

local function retrieveEntries(path, is_low_to_high, feature_keys, low, high)
    local ids = redis.call((is_low_to_high == 'true') and 'zrange' or 'zrevrange', path, low, high);
    local features = {}

    while #feature_keys > 0 do
        local key = table.remove(feature_keys, 1)

        local scores = {}
        for n = 1, #ids, 1 do
            table.insert(scores, redis.call('ZSCORE', key, ids[n]))
        end
        features[#features+1] = scores
    end

    -- [
    --   ['foo', 'bar', 'baz'],
    --   [ [1, 2, 3], [4, 5, 6] ]
    -- ]
    return { ids, features }
end
`;

type SortDirection = 'desc' | 'asc';

/**
 * `KEYS[1]`: leaderboard key  
 * `ARGV[1]`: entry score
 * `ARGV[2]`: entry id
 * 
 * Returns the final score
 */
const zbest = (dir: SortDirection) => `
    -- retrieve current score
    local ps = redis.call('zscore', KEYS[1], ARGV[2]);
    -- if it doesn't exist or the new score is better
    if not ps or tonumber(ARGV[1]) ${dir === 'desc' ? '>' : '<'} tonumber(ps) then
        -- replace entry
        redis.call('zadd', KEYS[1], ARGV[1], ARGV[2])
        return tonumber(ARGV[1])
    end
    return tonumber(ps)
`;

/**
 * `KEYS[1]`: leaderboard key  
 * `ARGV[1]`: entry id
 * 
 * Returns [score, rank]
 */
const zfind = (dir: SortDirection) => `
    return {
        redis.call('zscore', KEYS[1], ARGV[1]),
        redis.call('z${dir === 'desc' ? 'rev' : ''}rank', KEYS[1], ARGV[1])
    }
`;

/**
 * `KEYS[1]`: leaderboard key  
 * `ARGV[1]`: entry id  
 * `ARGV[2]`: distance  
 * `ARGV[3]`: fill_borders ('true' or 'false')
 * 
 * Returns [ lowest_rank, [[score, rank], ...] ]
 */
const zaround = (dir: SortDirection) => `
local function aroundRange(path, id, distance, fill_borders)
    local r = redis.call('z${dir === 'desc' ? 'rev' : ''}rank', path, id) -- entry rank

    if r == false or r == nil then
        -- entry does not exist
        return { -1, -1 }
    end
    
    local c = redis.call('zcard', path) -- lb size
    local l = math.max(0, r - distance) -- lower bound rank
    local h = 0                         -- high bound rank

    if fill_borders == 'true' then
        h = l + 2 * distance
        if h >= c then 
            h = math.min(c, r + distance)
            l = math.max(0, h - 2 * distance - 1)
        end
    else
        h = math.min(c, r + distance)
    end

    return { l, h, c, r };
end

local range = aroundRange(KEYS[1], ARGV[1], ARGV[2], ARGV[3]);
-- entry not found
if range[1] == -1 then return { 0, {} } end
return {
    range[1],
    -- retrive final rank
    redis.call('z${dir === 'desc' ? 'rev' : ''}range', KEYS[1], range[1], range[2], 'WITHSCORES')
}
`;

/**
 * Defines multiple commands useful to manage leaderboards:
 * * `zbest` & `zrevbest`: replace the score of the specified member if it
 * doesn't exist or the provided score is (**lower** / **higher**)
 * than the old one. Returns the updated score
 * * `zfind` & `zrevfind`: find the score and rank of a given member
 * * `zaround` & `zrevaround`: return the entries around an entry in a defined
 * distance with a fill border policy
 * 
 * @see https://github.com/luin/ioredis#lua-scripting
 * @param client the client to define the commands
 */
export function extendRedisClient(client: Redis) {
    client.defineCommand("zbest",      { numberOfKeys: 1, lua: zbest('asc')    });
    client.defineCommand("zrevbest",   { numberOfKeys: 1, lua: zbest('desc')   });
    client.defineCommand("zfind",      { numberOfKeys: 1, lua: zfind('asc')    });
    client.defineCommand("zrevfind",   { numberOfKeys: 1, lua: zfind('desc')   });
    client.defineCommand("zaround",    { numberOfKeys: 1, lua: zaround('asc')  });
    client.defineCommand("zrevaround", { numberOfKeys: 1, lua: zaround('desc') });
}
