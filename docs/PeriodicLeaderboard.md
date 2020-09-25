## PeriodicLeaderboard

This class does not extends `Leaderboard`. This class generates the appropiate `Leaderboard` instance for each period cycle.  
Each cycle (a unique Leaderboard) is identified by a `PeriodicKey` (a string).

Every time you want to interact with the leaderboard, you need to retrieve the appropiate based on the current time and cycle function. When entering a new cycle, you'll receive the new leaderboard right away. Stale (and active) leaderboards can be retrieved with `getExistingKeys`.

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
      * `weekly`: cut is Saturday-Sunday
      * `monthly`
      * `yearly`
    * `CycleFunction`: `(time: Date) =>` [PeriodicKey]() takes a time and retruns the appropiate `PeriodicKey` for that time (internally the suffix for the Redis key).  
    The key returned must be appropiate for local time (not UTC).  
    See [EXAMPLES.md](EXAMPLES.md) for examples.
  * `now`?: [NowFunction](): function to evaluate the current time.  
  If not provided, a function returning the local time will be used

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
