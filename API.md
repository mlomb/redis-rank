# API

(TODO: fix links ↓)

* [Types]()
* [Leaderboard]()
  * [Types]()
  * [Constructor]()
  * [Insert/update entries]()
  * [Remove entries]()
  * [Find entries]()
  * [List entries]()
  * [Export]()
  * [Information]()
* [PeriodicLeaderboard]()
  * [Types]()
  * [Constructor]()
  * [Keys]()
  * [Leaderboards]()
* [LeaderboardMatrix]()
  * [Types]()
  * [Constructor]()
  * [Leaderboards]()
  * [Insert/update entries]()
  * [Remove entries]()
  * [Find entries]()
  * [List entries]()
  * [Information]()

Examples can be found in [EXAMPLES.md](EXAMPLES.md).

## Types

Most common types exposed by the API.

* `ID`: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)
* `Score`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number)
* `Rank`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) 1-based
* `SortPolicy`: `'high-to-low'` | `'low-to-high'`
* `UpdatePolicy`: `'replace'` | `'aggregate'` | `'best'`

## Leaderboard

Plain and simple leaderboard. Ranks are 1-based.

### Types

* `Entry`:
  * `id`: [ID]() id
  * `score`: [Score]() score
  * `rank`: [Rank]() rank

### Constructor

#### Arguments

* `client`: [Redis](https://github.com/luin/ioredis#connect-to-redis) connection object
* `key`: [KeyType](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) Redis key for the sorted set (usually a string)
* `options`: [LeaderboardOptions]() configuration
  * `sortPolicy`: [SortPolicy]() determines which scores are better than others  
    Allowed values:
    * `'high-to-low'`: sort scores in descending order
    * `'low-to-high'`: sort scores in ascending order
  * `updatePolicy`: [UpdatePolicy]() determines what happens between old and new scores  
    Allowed values:
    * `'replace'`: the new score will replace the previous one
    * `'aggregate'`: previous and new scores will be added
    * `'best'`: the best score is kept (determined by the sort policy)
  * `limitTopN`?: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number): keep only the top N entries, determined by the sort policy.  
  This lets you limit the number of entries stored, thus saving memory.  
  If not specified, or the value is `0`, then there is no limit

#### Example

```javascript
const lb = new Leaderboard(client, 'lb:test', {
  sortPolicy: 'high-to-low',
  updatePolicy: 'replace'
  // limitTopN: 1000 (disabled, no limit)
});
```

### Insert/update entries

Note that when you update an entry that doesn't exist, it will be created, so update/insert is the same operation.

* `updateOne(id: ID, value: Score | number, updatePolicy?: UpdatePolicy)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Score]() | void> update a single entry
  * `id`: [ID]() id of the entry to update
  * `value`: [Score]() | [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) score or number to add
  * `updatePolicy`?: [UpdatePolicy]() override the default update policy **only for this update**

  The update behaviour is determined by the sort and update policies.

  #### Return
  If the update policy is  `aggregate` or `best` then the method will return the final score (the addition or the score which was better), otherwise void.

  #### Example
  ```javascript
  await lb.updateOne("player-1", 999);

  // override update policy
  await lb.updateOne("player-1", 999, 'replace');
  ```
  #### Complexity
  `O(log(N))` where N is the number of entries in the leaderboard.

  Note: why [Score]() | [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number)? When the update policy is set to `replace` or `best` the value should be a Score, but when the update policy is set to `aggregate` it behaves more like an amount than a full score. Either way, both are [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number).

* `update(entries: EntryUpdateQuery | EntryUpdateQuery[], updatePolicy?: UpdatePolicy)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Score]()[] | void[]> update one or more entries  
  * `entries`: [EntryUpdateQuery]() | [EntryUpdateQuery]()[] entry or entries to update
    * `EntryUpdateQuery`:
      * `id`: [ID]() id of the entry to update
      * `value`: [Score]() | [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) score or amount to add
  * `updatePolicy`?: [UpdatePolicy]() override the default update policy **only for this update**

  This method is very similar to `updateOne`, but it lets you update multiple entries in one go.

  #### Return
  Analogous to the return of `updateOne` but as an array, where each value matches the order of the entries in the input.
  #### Example
  ```javascript
  // single
  await lb.update({ id: "player-1", value: 999 });
  // multiple
  await lb.update([
    { id: "player-1", value: 123 },
    { id: "player-2", value: 420 },
    { id: "player-3", value: 777 },
    { id: "player-4", value: 696 }
  ]);
  // override update policy
  await lb.update({ id: "player-1", value: 999 }, 'replace');
  ```
  #### Complexity
  `O(log(N))` for each entry updated, where N is the number of entries in the leaderboard.

### Remove entries

* `remove(ids: ID | ID[])`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)&lt;void&gt; remove one or more entries from the leaderboard
  * `ids`: [ID]() | [ID]()[] id or ids to remove
  #### Example
  ```javascript
  // single
  await lb.remove("player-1");
  // multiple
  await lb.remove(["player-1", "player-2", "player-3"]);
  ```
  #### Complexity
  `O(M*log(N))` where N is the number of entries in the leaderboard and M the number of entries to be removed.

* `clear()`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)&lt;void&gt; remove all the entries from the leaderboard  
  Note: it will delete the underlying Redis key  
  #### Example
  ```javascript
  await lb.clear();
  // leaderboard is no more
  ```
  #### Complexity
  `O(N)` where N is the number of entries in the leaderboard.

### Find entries

* `score(id: ID)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Score]() | null> retrieve the score of an entry, null if it doesn't exist
  * `id`: [ID]() id of the entry
  #### Example
  ```javascript
  await lb.score("player-1"); /// === 999
  await lb.score("non-existant"); /// === null
  ```
  #### Complexity
  `O(1)`

* `rank(id: ID)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Rank]() | null> retrieve the rank of an entry, null if it doesn't exist
  * `id`: [ID]() id of the entry
  #### Example
  ```javascript
  await lb.rank("player-1"); /// === 3
  await lb.rank("non-existant"); /// === null
  ```
  #### Complexity
  `O(log(N))` where N is the number of entries in the leaderboard.

* `find(id: ID)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Entry]() | null> retrieve an entry, null if it doesn't exist  
  * `id`: [ID]() id of the entry
  #### Example
  ```javascript
  await lb.find("player-1"); /// === { "id": "player-1", score: 999, rank: 3 }
  await lb.find("non-existant"); /// === null
  ```
  #### Complexity
  `O(log(N))` where N is the number of entries in the leaderboard.

* `at(rank: Rank)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Entry]() | null> retrieve an entry at a specific rank, null if out of bounds
  * `rank`: [Rank]() rank to query
  #### Example
  ```javascript
  await lb.rank(3); /// === { "id": "player-1", score: 999, rank: 3 }
  await lb.rank(10000000); /// === null
  ```
  #### Complexity
  `O(log(N))` where N is the number of entries in the leaderboard.

### List entries

* `top(max: number)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Entry]()[]> retrieve the top entries
  * `max`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) number of entries to return
  #### Example
  ```javascript
  await lb.top(10); /// === [{ id: "n1", score: 999, rank: 1 }, ... 9 more]
  ```
  #### Complexity
  `O(log(N)+M)` where N is the number of entries in the leaderboard and M is `max`

* `bottom(max: number)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Entry]()[]> retrieve the bottom entries  (from worst to better)
  * `max`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) number of entries to return
  #### Example
  ```javascript
  await lb.bottom(10); /// === [{ id: "n10", score: 111, rank: 10 }, ... 9 more]
  ```
  #### Complexity
  `O(log(N)+M)` where N is the number of entries in the leaderboard and M is `max`

* `list(low: Rank, high: Rank)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Entry]()[]> retrieve entries between ranks
  * `low`: [Rank]() lower bound to query (inclusive)
  * `high`: [Rank]() higher bound to query (inclusive)
  #### Example
  ```javascript
  await lb.list(100, 200); /// === [{ id: "n100", score: 100, rank: 100 }, ... 100 more]
  ```
  #### Complexity
  `O(log(N)+M)` where N is the number of entries in the leaderboard and M the number of entries returned (`high` - `low` + 1)

* `around(id: ID, distance: number, fillBorders?: boolean = false)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Entry]()[]> retrieve the entries around an entry
  * `id`: [ID]() id of the entry at the center
  * `distance`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) number of entries at each side of the queried entry
  * `fillBorders`?: [boolean](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Boolean) whether to include entries at the other side if the entry is too close to one of the borders. In other words, it always makes sure to return at least 2*`distance`+1 entries (if there are enough in the leaderboard)
  #### Fill borders
  Let's say we have the following entries and we query the 3rd entry:  
  
  | 1st | 2dn | **3rd** | 4th | 5th | 6th | 7th | 8th | 9th | 10th |
  |:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:----:|
  |     |     |  **↑**  |     |     |     |     |     |     |      |

  Now we use `around("3rd", 4, fillBorders)` with
  * `fillBorders`=`false` → [ 1st, 2nd, **3rd**, 4th, 5th, 6th, 7th ] (default)
    * got 2 + 1 + 4 = 7 elements
  * `fillBorders`=`true` → [ 1st, 2nd, **3rd**, 4th, 5th, 6th, 7th, 8th, 9th ]
    * got 2 + 1 + 6 = 9 elements


  #### Example
  ```javascript
  await lb.around("3rd", 4); // fillBorders=false by default
  /// === [
  /// { id: "1st", score: 99, rank: 1 },
  /// { id: "2nd", score: 88, rank: 2 },
  /// { id: "3rd", score: 77, rank: 3 },
  /// ... 4 more
  /// ]
  ```
  ```javascript
  await lb.around("3rd", 4, true);
  /// === [
  /// { id: "1st", score: 99, rank: 1 },
  /// { id: "2nd", score: 88, rank: 2 },
  /// { id: "3rd", score: 77, rank: 3 },
  /// ... 6 more
  /// ]
  ```
  #### Complexity
  `O(log(N)+M)` where N is the number of entries in the leaderboard and M is (2*`distance`+1)

### Export

* `exportStream(batchSize: number)`: [Readable](https://nodejs.org/api/stream.html#stream_class_stream_readable) create a readable stream to iterate all entries in the leaderboard
  * `batchSize`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) number of entries to retrieve per iteration
  #### Example
  ```javascript
  const stream = lb.exportStream(100);
  stream.on("data", (entries) => {
    // process entries
    // note: (use pause and resume if you need to do async work, check out EXAMPLES.md)
  });
  stream.on("close", () => {
    // done
  });
  ```
  #### Complexity
  `O(log(N)+M)` each iteration, where N is the number of entries in the leaderboard and M the batch size

### Information

* `count()`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number)> returns the number of entries stored in the leaderboard. Complexity: `O(1)`
* `redisClient`: [Redis](https://github.com/luin/ioredis#connect-to-redis) redis connection
* `redisKey`: [KeyType](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) sorted set key
* `sortPolicy`: [SortPolicy]() sort policy
* `updatePolicy`: [UpdatePolicy]() update policy

## PeriodicLeaderboard

This class does not extends `Leaderboard`. This class generates the appropiate `Leaderboard` instance for each period cycle.  
Each cycle (a unique Leaderboard) is identified by a `PeriodicKey` (a string).

Every time you want to interact with the leaderboard, you need to retrieve the appropiate based on the current time and cycle function. When entering a new cycle, you'll receive the new leaderboard right away. Stale leaderboards can be retrieved with `getExistingKeys`.

### Types

* `PeriodicKey`: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) uniquely identifies a cycle
* `NowFunction`: `() =>` [Date](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Date)

### Constructor

#### Arguments

* `client`: [Redis](https://github.com/luin/ioredis#connect-to-redis) connection object
* `baseKey`: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) prefix for all the leaderboards
* `options`: [PeriodicLeaderboardOptions]() configuration
  * `leaderboardOptions`: [LeaderboardOptions]() underlying leaderboard options
  * `cycle`: [PeriodicLeaderboardCycle]() = [CycleFunction]() | [DefaultCycles](): time cycle
    * `DefaultCycles`: default cycles  
    Allowed values:
      * `minute`
      * `hourly`
      * `daily`
      * `weekly`
      * `monthly`
      * `yearly`
    * `CycleFunction`: `(time: Date) =>` [PeriodicKey]() takes a time and retruns the appropiate `PeriodicKey` for that time (internally the suffix for the Redis key).  
    The key returned must be appropiate for local time (not UTC).  
    See [EXAMPLES.md](EXAMPLES.md) for examples.
  * `now`?: [NowFunction](): function to evaluate the current time

#### Example

```javascript
const plb = new PeriodicLeaderboard(client, "plb:test", {
  leaderboardOptions: {
    sortPolicy: 'high-to-low',
    updatePolicy: 'replace'
  },
  cycle: 'monthly'
});
```

### Keys

* `getKey(time: Date)`: [PeriodicKey]() get the periodic key at a specified date and time
  * `time`: [Date](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Date) the time

* `getKeyNow()`: [PeriodicKey]() get the current leaderboard based on the time returned by `now()`

* `getExistingKeys()`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[PeriodicKey]()[]> find all the active periodic keys in the database.  
  Use this function sparsely, it uses `SCAN` over the whole database to find matches.  
  ⚠️ I recommend having periodic leaderboards on a database index other than the main one if you plan to call this function a lot.
  #### Complexity
  `O(N)` where N is the number of keys in the Redis database

### Leaderboards

* `getLeaderboard(key: PeriodicKey)`: [Leaderboard]() get the leaderboard for the provided periodic key
  * `key`: [PeriodicKey]() periodic key

* `getLeaderboardAt(time?: Date)`: [Leaderboard]() get the leaderboard at the specified date and time
  * `time`?: [Date](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Date) the time

  If `time` is not provided, it will use the time returned by `now()`

* `getLeaderboardNow()`: [Leaderboard]() get the current leaderboard based on the time returned by `now()`

## LeaderboardMatrix

### Types

* `DimensionName`: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) dimension name in a matrix
* `FeatureName`: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) feature name in a matrix
* `MatrixEntry`:
  * `id`: [ID]() entry id
  * `ranks`: `{ [dimension: string]: { [feature: string]: Rank } }` entry ranks
  * `scores`: `{ [dimension: string]: { [feature: string]: Score } }` entry scores
  
* `MatrixLeaderboardQueryFilter`: filter query results
  * `dimensions`?: [DimensionName]()[] dimensions to include in the result. If undefined or empty, all dimensions will be included
  * `features`?: [FeatureName]()[] features to include in the result. If undefined or empty, all features will be included

### Constructor

#### Arguments

* `client`: [Redis](https://github.com/luin/ioredis#connect-to-redis) connection object
* `baseKey`: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) prefix for the Redis key of all leaderboards in the matrix
* `options`: [LeaderboardMatrixOptions]() configuration
  * `dimensions`: [DimensionDefinition]()[] dimensions
    * `DimensionDefinition`:
      * `name`: [DimensionName]() dimension name (string)
      * `cycle`?: [PeriodicLeaderboardCycle]() cycle if the dimension is periodic
  * `features`: [FeatureDefinition]()[] features
    * `FeatureDefinition`:
      * `name`: [FeatureName]() feature name (string)
      * `options`: [LeaderboardOptions]() feature's leaderboard options
  * `now`?: [NowFunction](): function to evaluate the current time for periodic leaderboards

#### Example

```javascript
const mlb = new LeaderboardMatrix(client, "mlb:test", {
  dimensions: [
    { name: "global" },
    {
      name: "per-month",
      cycle: 'monthly'
    }
  ],
  features: [{
    name: "kills",
    options: {
      updatePolicy: 'replace',
      sortPolicy: 'high-to-low'
    }
  }, {
    name: "seconds",
    options: {
      updatePolicy: 'best',
      sortPolicy: 'low-to-high'
    }
  }]
});
```

### Leaderboards

* `getLeaderboard(dimension: DimensionName, feature: FeatureName, time?: Date)`: [Leaderboard]() | `null` get a leaderboard in the matrix
  * `dimension`: [DimensionName]() dimension name
  * `feature`: [FeatureName]() feature name
  * `time`?: [Date](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Date) time (for periodic leaderboards). If not provided, `now()` will be used
  
  Note: returns null if the dimension/feature pair is invalid

* `getRawLeaderboard(dimension: DimensionName, feature: FeatureName)`: [Leaderboard]() | [PeriodicLeaderboard]() | `null` get the raw leaderboard object
  * `dimension`: [DimensionName]() dimension name
  * `feature`: [FeatureName]() feature name
  
  The difference with `getLeaderboard` is that you get the underlying periodic leaderboard wrapper instead of a specific leaderboard of a periodic cycle.
  
### Insert/update entries

Remember that insert/update is the same operation.

* `update(entries: MatrixEntryUpdateQuery | MatrixEntryUpdateQuery[], dimensions?: DimensionName[], updatePolicy?: UpdatePolicy)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)&lt;any&gt; update one or more entries. If one of the entries does not exists, it will be created

  * `entries`: [MatrixEntryUpdateQuery]() | [MatrixEntryUpdateQuery]()[] entry or list of entries to update
    * `MatrixEntryUpdateQuery`:
      * `id`: [ID]() entry id
      * `values`: `{ [feature: string] : number | Score }` features to update
  * `dimensions`?: [DimensionName]()[] filter the update to only this dimensions. If empty or undefined, all dimensions will be updated
  * `updatePolicy`?: [UpdatePolicy]() override every default update policy **only for this update**

  The update behaviour is determined by the sort and update policies of each leaderboard in the matrix (or overriden by `updatePolicy`)
  #### Example
  ```javascript
  await mlb.update([{
    id: "player-1",
    values: {
      kills: 27,
      time: 427
    }
  }], ["global"]); // update only the global dimension
  ```

### Remove entries

* `remove(ids: ID | ID[], dimensions?: DimensionName[], features?: FeatureName[])`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)&lt;void&gt; remove one or more entries from the leaderboards
  * `ids`: [ID]() | [ID]()[] ids to remove
  * `dimensions`?: [DimensionName]()[] dimensions to remove from. If empty or undefined, entries will be removed from all dimensions
  * `features`?: [FeatureName]()[] features to remove from. If empty or undefined, entries will be removed from all features

### Find entries

* `find(ids: ID, filter?: MatrixLeaderboardQueryFilter)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[MatrixEntry]() | null> retrieve an entry. If it doesn't exist, it returns null
  * `id`: [ID]() entry id
  * `filter`?: [MatrixLeaderboardQueryFilter]() filter to apply
  #### Example
  ```javascript
  await mlb.find("player-1");
  ```
  ```javascript
  {
    id: "player-1",
    ranks: {
      global: {
        kills: 1,
        time: 1
      }
    },
    scores: {
     global: {
       kills: 27,
       time: 427
     }
   }
  }
  ```

### List entries

When you retrieve a list of entries, you must specify the dimension and feature you want to sort. Then the filter is applied and you can retrieve data from all other leaderboards in the matrix.

* `list(dimensionToSort: DimensionName, featureToSort: FeatureName, lower: Rank, upper: Rank, filter?: MatrixLeaderboardQueryFilter)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[MatrixEntry]()[]> retrieve entries between ranks
  * `dimensionToSort`: [DimensionName]() dimension to perform the sorting
  * `featureToSort`: [FeatureName]() feature to perform the sorting
  * `lower`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) lower bound to query (inclusive)
  * `upper`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) upper bound to query (inclusive)
  * `filter`?: [MatrixLeaderboardQueryFilter]() filter to apply

* `top(dimensionToSort: DimensionName, featureToSort: FeatureName, max: number = 10, filter?: MatrixLeaderboardQueryFilter)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[MatrixEntry]()[]> retrieve the top entries
  * `dimensionToSort`: [DimensionName]() dimension to perform the sorting
  * `featureToSort`: [FeatureName]() feature to perform the sorting
  * `max`?: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) max number of entries to return
  * `filter`?: [MatrixLeaderboardQueryFilter]() filter to apply

* `bottom(dimensionToSort: DimensionName, featureToSort: FeatureName, max: number = 10, filter?: MatrixLeaderboardQueryFilter)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[MatrixEntry]()[]> retrieve the bottom entries (from worst to better)
  * `dimensionToSort`: [DimensionName]() dimension to perform the sorting
  * `featureToSort`: [FeatureName]() feature to perform the sorting
  * `max`?: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) max number of entries to return
  * `filter`: [MatrixLeaderboardQueryFilter]() filter to apply

* `around(dimensionToSort: DimensionName, featureToSort: FeatureName, id: ID, distance: number, fillBorders: boolean = false, filter?: MatrixLeaderboardQueryFilter)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[MatrixEntry]()[]> retrieve the entries around an entry
  * `dimensionToSort`: [DimensionName]() dimension to perform the sorting
  * `featureToSort`: [FeatureName]() feature to perform the sorting
  * `id`: [ID]() id of the entry at the center
  * `distance`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) number of entries at each side of the queried entry
  * `fillBorders`?: [FeatureName]() include entries at the other side if the entry is too close to one of the borders
  * `filter`?: [MatrixLeaderboardQueryFilter]() filter to apply

  For details, see the simple leaderboard version of `around()`.

* `showcase(dimensionOrder: DimensionName[], featureToSort: FeatureName, threshold: number, filter: MatrixLeaderboardQueryFilter)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[MatrixShowcase]() | null> returns the top `threshold` entries from a leaderboard that has at least `threshold` entries
  * `dimensionOrder`: [DimensionName]()[] order to test the dimensions
  * `featureToSort`: [FeatureName]() feature to perform the sorting
  * `threshold`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) minimum number of entries that should be present in the leaderboard
  * `filter`?: [MatrixLeaderboardQueryFilter]() filter to apply

  The `dimensionOrder` defines the order to check the leaderboards, and `featureToSort` the feature (which is fixed).  
  If no dimension meet the threshold, then the dimension with the highest number of entries will be used to query the entries.  
  If all dimensions have 0 entries, then returns null
  
  Note: this function actually does two round trips to Redis!

  #### Return
  `MatrixShowcase`:
    * `dimension`: [DimensionName]() dimension chosen
    * `feature`: [FeatureName]() feature chosen
    * `entries`: [MatrixEntry]()[] entries

### Information

* `count()`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[MatrixCount]()> retrieve the number of entries in each leaderboard 
  #### Return
  `MatrixCount`:
    * `{ [dimension: string ]: { [feature: string]: number } }`
