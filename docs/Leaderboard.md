## Leaderboard

Plain and simple leaderboard. Ranks are 1-based.

### Types

* `Entry`:
  * `id`: [ID](/docs#types) id
  * `score`: [Score](/docs#types) score
  * `rank`: [Rank](/docs#types) rank

### Constructor

#### Arguments

* `client`: [Redis](https://github.com/luin/ioredis#connect-to-redis) connection object
* `key`: [KeyType](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) Redis key for the sorted set (usually a string)
* `options`: [LeaderboardOptions](/docs/Leaderboard.md#arguments) configuration
  * `sortPolicy`: [SortPolicy](/docs#types) determines which scores are better than others  
    Allowed values:
    * `'high-to-low'`: sort scores in descending order
    * `'low-to-high'`: sort scores in ascending order
  * `updatePolicy`: [UpdatePolicy](/docs#types) determines what happens between old and new scores  
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

* `updateOne(id: ID, value: Score | number, updatePolicy?: UpdatePolicy)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Score](/docs#types) | void> update a single entry
  * `id`: [ID](/docs#types) id of the entry to update
  * `value`: [Score](/docs#types) | [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) score or number to add
  * `updatePolicy`?: [UpdatePolicy](/docs#types) override the default update policy **only for this update**

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

  Note: why [Score](/docs#types) | [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number)? When the update policy is set to `replace` or `best` the value should be a Score, but when the update policy is set to `aggregate` it behaves more like an amount than a full score. Either way, both are [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number).

* `update(entries: EntryUpdateQuery | EntryUpdateQuery[], updatePolicy?: UpdatePolicy)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Score](/docs#types)[] | void[]> update one or more entries  
  * `entries`: [EntryUpdateQuery](/docs/Leaderboard.md#insertupdate-entries) | [EntryUpdateQuery](/docs/Leaderboard.md#insertupdate-entries)[] entry or entries to update
    * `EntryUpdateQuery`:
      * `id`: [ID](/docs#types) id of the entry to update
      * `value`: [Score](/docs#types) | [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) score or amount to add
  * `updatePolicy`?: [UpdatePolicy](/docs#types) override the default update policy **only for this update**

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
  * `ids`: [ID](/docs#types) | [ID](/docs#types)[] id or ids to remove
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

* `score(id: ID)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Score](/docs#types) | null> retrieve the score of an entry, null if it doesn't exist
  * `id`: [ID](/docs#types) id of the entry
  #### Example
  ```javascript
  await lb.score("player-1"); /// === 999
  await lb.score("non-existant"); /// === null
  ```
  #### Complexity
  `O(1)`

* `rank(id: ID)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Rank](/docs#types) | null> retrieve the rank of an entry, null if it doesn't exist
  * `id`: [ID](/docs#types) id of the entry
  #### Example
  ```javascript
  await lb.rank("player-1"); /// === 3
  await lb.rank("non-existant"); /// === null
  ```
  #### Complexity
  `O(log(N))` where N is the number of entries in the leaderboard.

* `find(id: ID)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Entry](docs/Leaderboard.md#types) | null> retrieve an entry, null if it doesn't exist  
  * `id`: [ID](/docs#types) id of the entry
  #### Example
  ```javascript
  await lb.find("player-1"); /// === { "id": "player-1", score: 999, rank: 3 }
  await lb.find("non-existant"); /// === null
  ```
  #### Complexity
  `O(log(N))` where N is the number of entries in the leaderboard.

* `at(rank: Rank)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Entry](docs/Leaderboard.md#types) | null> retrieve an entry at a specific rank, null if out of bounds
  * `rank`: [Rank](/docs#types) rank to query
  #### Example
  ```javascript
  await lb.rank(3); /// === { "id": "player-1", score: 999, rank: 3 }
  await lb.rank(10000000); /// === null
  ```
  #### Complexity
  `O(log(N))` where N is the number of entries in the leaderboard.

### List entries

* `top(max: number)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Entry](docs/Leaderboard.md#types)[]> retrieve the top entries
  * `max`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) number of entries to return
  #### Example
  ```javascript
  await lb.top(10); /// === [{ id: "n1", score: 999, rank: 1 }, ... 9 more]
  ```
  #### Complexity
  `O(log(N)+M)` where N is the number of entries in the leaderboard and M is `max`

* `bottom(max: number)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Entry](docs/Leaderboard.md#types)[]> retrieve the bottom entries  (from worst to better)
  * `max`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) number of entries to return
  #### Example
  ```javascript
  await lb.bottom(10); /// === [{ id: "n10", score: 111, rank: 10 }, ... 9 more]
  ```
  #### Complexity
  `O(log(N)+M)` where N is the number of entries in the leaderboard and M is `max`

* `list(low: Rank, high: Rank)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Entry](docs/Leaderboard.md#types)[]> retrieve entries between ranks
  * `low`: [Rank](/docs#types) lower bound to query (inclusive)
  * `high`: [Rank](/docs#types) higher bound to query (inclusive)
  #### Example
  ```javascript
  await lb.list(100, 200); /// === [{ id: "n100", score: 100, rank: 100 }, ... 100 more]
  ```
  #### Complexity
  `O(log(N)+M)` where N is the number of entries in the leaderboard and M the number of entries returned (`high` - `low` + 1)

* `around(id: ID, distance: number, fillBorders?: boolean = false)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Entry](docs/Leaderboard.md#types)[]> retrieve the entries around an entry
  * `id`: [ID](/docs#types) id of the entry at the center
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


* `listByScore(min: Score, max: Score)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Entry](docs/Leaderboard.md#types)[]> retrieve entries within a score range
  * `min`: [Score](/docs#types) min score to query (inclusive)
  * `max`: [Score](/docs#types) max score to query (inclusive)
  #### Example
  ```javascript
  await lb.listByScore(20, 30);
  /// === [
  /// { id: "ecd", score: 20, rank: 37 },
  /// { id: "yug", score: 22, rank: 38 },
  /// { id: "bls", score: 27, rank: 39 }
  /// ]
  ```
  #### Complexity
  `O(log(N)+M)` where N is the number of entries in the leaderboard and M the number of entries returned


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
* `sortPolicy`: [SortPolicy](/docs#types) sort policy
* `updatePolicy`: [UpdatePolicy](/docs#types) update policy
