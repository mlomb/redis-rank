## LeaderboardMatrix

### Types

* `DimensionName`: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) dimension name in a matrix
* `FeatureName`: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) feature name in a matrix
* `MatrixEntry`:
  * `id`: [ID](/docs#types) entry id
  * `ranks`: `{ [dimension: string]: { [feature: string]: Rank } }` entry ranks
  * `scores`: `{ [dimension: string]: { [feature: string]: Score } }` entry scores
  
* `MatrixLeaderboardQueryFilter`: filter query results
  * `dimensions`?: [DimensionName](/docs/LeaderboardMatrix.md#types)[] dimensions to include in the result. If undefined or empty, all dimensions will be included
  * `features`?: [FeatureName](/docs/LeaderboardMatrix.md#types)[] features to include in the result. If undefined or empty, all features will be included

❗ Note: filters only affect the values returned, not the leaderboards searched (leaderboards searched are set using `dimensionToSort` and `featureToSort`)

### Constructor

#### Arguments

* `client`: [Redis](https://github.com/luin/ioredis#connect-to-redis) connection object
* `baseKey`: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) prefix for the Redis key of all leaderboards in the matrix
* `options`: [LeaderboardMatrixOptions](/docs/LeaderboardMatrix.md#arguments) configuration
  * `dimensions`: [DimensionDefinition](/docs/LeaderboardMatrix.md#arguments)[] dimensions
    * `DimensionDefinition`:
      * `name`: [DimensionName](/docs/LeaderboardMatrix.md#types) dimension name (string)
      * `cycle`?: [PeriodicLeaderboardCycle](/docs/PeriodicLeaderboard.md#arguments) cycle if the dimension is periodic
  * `features`: [FeatureDefinition](/docs/LeaderboardMatrix.md#arguments)[] features
    * `FeatureDefinition`:
      * `name`: [FeatureName](/docs/LeaderboardMatrix.md#types) feature name (string)
      * `options`: [LeaderboardOptions](/docs/Leaderboard.md#arguments) feature's leaderboard options
  * `now`?: [NowFunction](/docs/PeriodicLeaderboard.md#types): function to evaluate the current time for periodic leaderboards

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

* `getLeaderboard(dimension: DimensionName, feature: FeatureName, time?: Date)`: [Leaderboard](/docs/Leaderboard.md) | `null` get a leaderboard in the matrix
  * `dimension`: [DimensionName](/docs/LeaderboardMatrix.md#types) dimension name
  * `feature`: [FeatureName](/docs/LeaderboardMatrix.md#types) feature name
  * `time`?: [Date](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Date) time (for periodic leaderboards). If not provided, `now()` will be used
  
  Note: returns null if the dimension/feature pair is invalid

* `getRawLeaderboard(dimension: DimensionName, feature: FeatureName)`: [Leaderboard](/docs/Leaderboard.md) | [PeriodicLeaderboard](/docs/PeriodicLeaderboard.md) | `null` get the raw leaderboard object
  * `dimension`: [DimensionName](/docs/LeaderboardMatrix.md#types) dimension name
  * `feature`: [FeatureName](/docs/LeaderboardMatrix.md#types) feature name
  
  The difference with `getLeaderboard` is that you get the underlying periodic leaderboard wrapper instead of a specific leaderboard of a periodic cycle.
  
### Insert/update entries

Remember that insert/update is the same operation.

* `update(entries: MatrixEntryUpdateQuery | MatrixEntryUpdateQuery[], dimensions?: DimensionName[], updatePolicy?: UpdatePolicy)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)&lt;any&gt; update one or more entries. If one of the entries does not exists, it will be created

  * `entries`: [MatrixEntryUpdateQuery](/docs/LeaderboardMatrix.md#insertupdate-entries) | [MatrixEntryUpdateQuery](/docs/LeaderboardMatrix.md#insertupdate-entries)[] entry or list of entries to update
    * `MatrixEntryUpdateQuery`:
      * `id`: [ID](/docs#types) entry id
      * `values`: `{ [feature: string] : number | Score }` features to update
  * `dimensions`?: [DimensionName](/docs/LeaderboardMatrix.md#types)[] filter the update to only this dimensions. If empty or undefined, all dimensions will be updated
  * `updatePolicy`?: [UpdatePolicy](/docs#types) override every default update policy **only for this update**

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
  * `ids`: [ID](/docs#types) | [ID](/docs#types)[] ids to remove
  * `dimensions`?: [DimensionName](/docs/LeaderboardMatrix.md#types)[] dimensions to remove from. If empty or undefined, entries will be removed from all dimensions
  * `features`?: [FeatureName](/docs/LeaderboardMatrix.md#types)[] features to remove from. If empty or undefined, entries will be removed from all features

### Find entries

* `find(ids: ID, filter?: MatrixLeaderboardQueryFilter)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[MatrixEntry](/docs/LeaderboardMatrix.md#types) | null> retrieve an entry. If it doesn't exist, it returns null
  * `id`: [ID](/docs#types) entry id
  * `filter`?: [MatrixLeaderboardQueryFilter](/docs/LeaderboardMatrix.md#types) filter to apply
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

* `list(dimensionToSort: DimensionName, featureToSort: FeatureName, lower: Rank, upper: Rank, filter?: MatrixLeaderboardQueryFilter)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[MatrixEntry](/docs/LeaderboardMatrix.md#types)[]> retrieve entries between ranks
  * `dimensionToSort`: [DimensionName](/docs/LeaderboardMatrix.md#types) dimension to perform the sorting
  * `featureToSort`: [FeatureName](/docs/LeaderboardMatrix.md#types) feature to perform the sorting
  * `lower`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) lower bound to query (inclusive)
  * `upper`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) upper bound to query (inclusive)
  * `filter`?: [MatrixLeaderboardQueryFilter](/docs/LeaderboardMatrix.md#types) filter to apply

* `top(dimensionToSort: DimensionName, featureToSort: FeatureName, max: number = 10, filter?: MatrixLeaderboardQueryFilter)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[MatrixEntry](/docs/LeaderboardMatrix.md#types)[]> retrieve the top entries
  * `dimensionToSort`: [DimensionName](/docs/LeaderboardMatrix.md#types) dimension to perform the sorting
  * `featureToSort`: [FeatureName](/docs/LeaderboardMatrix.md#types) feature to perform the sorting
  * `max`?: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) max number of entries to return
  * `filter`?: [MatrixLeaderboardQueryFilter](/docs/LeaderboardMatrix.md#types) filter to apply

* `bottom(dimensionToSort: DimensionName, featureToSort: FeatureName, max: number = 10, filter?: MatrixLeaderboardQueryFilter)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[MatrixEntry](/docs/LeaderboardMatrix.md#types)[]> retrieve the bottom entries (from worst to better)
  * `dimensionToSort`: [DimensionName](/docs/LeaderboardMatrix.md#types) dimension to perform the sorting
  * `featureToSort`: [FeatureName](/docs/LeaderboardMatrix.md#types) feature to perform the sorting
  * `max`?: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) max number of entries to return
  * `filter`: [MatrixLeaderboardQueryFilter](/docs/LeaderboardMatrix.md#types) filter to apply

* `around(dimensionToSort: DimensionName, featureToSort: FeatureName, id: ID, distance: number, fillBorders: boolean = false, filter?: MatrixLeaderboardQueryFilter)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[MatrixEntry](/docs/LeaderboardMatrix.md#types)[]> retrieve the entries around an entry
  * `dimensionToSort`: [DimensionName](/docs/LeaderboardMatrix.md#types) dimension to perform the sorting
  * `featureToSort`: [FeatureName](/docs/LeaderboardMatrix.md#types) feature to perform the sorting
  * `id`: [ID](/docs#types) id of the entry at the center
  * `distance`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) number of entries at each side of the queried entry
  * `fillBorders`?: [FeatureName](/docs/LeaderboardMatrix.md#types) include entries at the other side if the entry is too close to one of the borders
  * `filter`?: [MatrixLeaderboardQueryFilter](/docs/LeaderboardMatrix.md#types) filter to apply

  For details, see the simple leaderboard version of `around()`.

* `showcase(dimensionOrder: DimensionName[], featureToSort: FeatureName, threshold: number, filter: MatrixLeaderboardQueryFilter)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[MatrixShowcase](/docs/LeaderboardMatrix.md#return) | null> returns the top `threshold` entries from a leaderboard that has at least `threshold` entries
  * `dimensionOrder`: [DimensionName](/docs/LeaderboardMatrix.md#types)[] order to test the dimensions
  * `featureToSort`: [FeatureName](/docs/LeaderboardMatrix.md#types) feature to perform the sorting
  * `threshold`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) minimum number of entries that should be present in the leaderboard
  * `filter`?: [MatrixLeaderboardQueryFilter](/docs/LeaderboardMatrix.md#types) filter to apply

  The `dimensionOrder` defines the order to check the leaderboards, and `featureToSort` the feature (which is fixed).  
  If no dimension meet the threshold, then the dimension with the highest number of entries will be used to query the entries.  
  If all dimensions have 0 entries, then returns null
  
  Note: this function actually does two round trips to Redis!

  #### Return
  `MatrixShowcase`:
    * `dimension`: [DimensionName](/docs/LeaderboardMatrix.md#types) dimension chosen
    * `feature`: [FeatureName](/docs/LeaderboardMatrix.md#types) feature chosen
    * `entries`: [MatrixEntry](/docs/LeaderboardMatrix.md#types)[] entries

### Information

* `count()`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[MatrixCount](/docs/LeaderboardMatrix.md#return-1)> retrieve the number of entries in each leaderboard 
  #### Return
  `MatrixCount`:
    * `{ [dimension: string ]: { [feature: string]: number } }`
