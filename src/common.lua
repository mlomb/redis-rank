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

local function aroundRange(path, is_low_to_high, id, distance, fill_borders)
    local r = redis.call((is_low_to_high == 'true') and 'zrank' or 'zrevrank', path, id)
    if r == false or r == nil then
        return { -1, -1 }
    end
    local c = redis.call('zcard', path)
    local l = math.max(0, r - distance)
    local h = 0
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
