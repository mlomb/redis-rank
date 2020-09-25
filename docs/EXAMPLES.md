# Examples

Please note that the following examples do not show all the available options and features. Dive into the [API documentation](/docs) for more information.

❗ Note: Ranks are 1-based.

## Basic leaderboard usage

Create a plain leaderboard:

```javascript
const lb = new Leaderboard(client, 'lb:example', {
    sortPolicy: 'high-to-low',
    updatePolicy: 'replace'
});
```

* `client` is the ioredis connection
* `lb:example` is the Redis key of the sorted set.
* `sortPolicy` is set to `high-to-low`, that means higher scores will be considered better
* `updatePolicy` is set to `best`, that means when we update the leaderboard, it will only be updated if the score is better (depending on `sortPolicy`) than the previously stored score.  
  Also `replace` and `increment` are supported.

Now we can start doing queries to it!  
Let's add some entries to it:

```javascript
await lb.update([
    { id: "player1", value: 17 },
    { id: "player2", value: 97 },
    { id: "player3", value: 43 },
    { id: "player4", value: 12 },
    { id: "player5", value: 58 }
]);
```

Psst: you can also specify an update policy to override the default for that update only.

Now query the entries, for example, the top 3:

```javascript
await lb.top(3);
```
```javascript
[
    { id: 'player2', score: 97, rank: 1 },
    { id: 'player5', score: 58, rank: 2 },
    { id: 'player3', score: 43, rank: 3 }
]
```

Awesome! Remember that you can also use `bottom` to retrieve the worst entries.

Now lets say we want to list a specific range of ranks, for example, from rank 3 to 5:

```javascript
await lb.list(3, 5); // ranks are inclusive [lower, upper]
```
```javascript
[
    { id: 'player3', score: 43, rank: 3 },
    { id: 'player1', score: 17, rank: 4 },
    { id: 'player4', score: 12, rank: 5 }
]
```

Now how to query entries **around** another entries. For example, the entries at distance 1 of `player3`:

```javascript
await lb.around("player3", 1);
```
```javascript
[
    { id: 'player5', score: 58, rank: 2 }, // dist 1
    { id: 'player3', score: 43, rank: 3 }, // center
    { id: 'player1', score: 17, rank: 4 }  // dist 1
]
```

Psst: you can change the behaviour of `around` near the borders, check the documentation!

Want to find a specific entry?

```javascript
await lb.find("player5");
```
```javascript
{ id: 'player5', score: 58, rank: 2 }
```

Want to remove bad entries?

```javascript
await lb.remove(["player1", "player3", "player5"]); // odds are bad 😠
```

Want to know how many entries are in the leaderboard?

```javascript
await lb.count();
```
```javascript
2
```

Want to reset the leaderboard? (remove all entries)

```javascript
await lb.clear();
```

Enough for an introduction!


## Exporting a leaderboard

To export a Leaderboard, you call `exportStream(batchSize)` in a leaderboard object, which returns a [Readable stream](https://nodejs.org/api/stream.html#stream_readable_streams) that lets you iterate every entry in the leaderboard:

```javascript
const stream = lb.exportStream(1000);

stream.on("data", (entries) => {
    // process entries
});
stream.on("end", () => {
    // finished
});
```

If you want to do async work when you receive each batch (for example, insert the data into MySQL), then you should use the `pasue` and `resume` functions in the stream:

```javascript
stream.on("data", (entries) => {
    stream.pause();

    doSomeAsyncWork(entries).then(() => {
        // continue processing
        stream.resume();
    });
});
```

or with async/await:

```javascript
stream.on("data", async (entries) => {
    stream.pause();
    await doSomeAsyncWork(entries);
    stream.resume();
});
```


## Recurring leaderboards

Let's say you want to create a leaderboard that "resets" each month (for custom cycles see the [custom cycles example](#custom-cycles)). I say "reset" in quotes because the previous Redis Key is not deleted or altered when a cycle ends (a month). A new key is generated for each cycle identified by a `CycleKey`. If you want to delete or export previous leaderboards see the [clean stale leaderboards example](#clean-stale-leaderboards).

Create the periodic leaderboard:

```javascript
const plb = new PeriodicLeaderboard(client, "plb:test", {
    leaderboardOptions: {
        sortPolicy: 'high-to-low',
        updatePolicy: 'replace'
    },
    cycle: 'monthly'
});
```

Now you use `getLeaderboardNow` to get the leaderboard for the current cycle (month in this case):

```javascript
const lb = plb.getLeaderboardNow();
```

Now you can use `lb` as a regular leaderboard. You should call `getLeaderboardNow` every time you want to access the current leaderboard, to make sure you are always on the last cycle.

In the above example, the `CycleKey` was automatically handled. If you want, or have specific needs, you can use the following, which is equivalent:

```javascript
const cycleKey = plb.getKeyNow(); // do something with this
const lb = plb.getLeaderboard(cycleKey);
```

#### What does a `CycleKey` look like?
* `yearly`: `y2020`
* `weekly`: `w2650` (week number since epoch)
* `monthly`: `y2020-m05`
* `daily`: `y2020-m05-d15`
* `hourly`: `y2020-m05-d15-h22`
* `minute`: `y2020-m05-d15-h22-m53`


## Custom cycles

You will have to pass a `CycleFunction` to the options object in the `PeriodicLeaderboard` constructor.  
This function takes a time and returns the appropiate `CycleKey` that **uniquely** identifies the cycle that the time provided belongs to.

The provided time will be in local time, so you must return the appropiate cycle in local time. If you want to offset the time, please use the `now` function in the options.

#### Every 5 minutes

```javascript
const cycleFunction = (time) => `y${time.getFullYear()}-m${time.getMonth()}-d${time.getDate()}-h${time.getHours()}-5m${Math.floor(time.getMinutes() / 5)}`;
```

#### Every 3 months

```javascript
const cycleFunction = (time) => `y${time.getFullYear()}-m${Math.floor(time.getMonth() / 3)}`;
```

#### Every N days

This is a bit more complicated, because what happens when the cycle spans over a new year? Should the last cycle be shorter? Should always mantain the same number of days no matter what? (like weekly). On top of that, you have to think which day is the first day in the cycle.

If you just want to truncate the cycle at the end of the year:

```javascript
const cycleFunction = (time) => `y${time.getFullYear()}-m${Math.floor(getDayOfTheYear(time) / N)}`;
```

Note that cycles will start on January 1st every year. You wil have to implement `getDayOfTheYear` yourself.

If you need that all cycles are fixed, you will have to rely on the number of days since epoch (this is how weekly works, check [Defaults](#defaults) below):

```javascript
const cycleFunction = (time) => `dN-${Math.floor(getDaySinceEpoch(time) / N)}`;
```

Of couse you can add an offset to make it start when you need. You will have to implement `getDaySinceEpoch` yourself.

#### Defaults

You can see how the default cycles are defined in the object `CYCLE_FUNCTIONS` in [PeriodicLeaderboard.ts](/lib/PeriodicLeaderboard.ts#L77).

#### Pass cycle

```javascript
const plb = new PeriodicLeaderboard(client, "plb:custom", {
    leaderboardOptions: { ... },
    cycle: cycleFunction
});
```

## Clean stale leaderboards

You may get stale leaderboards by using periodic leaderboards. You can retrieve arbitrary cycles using `getLeaderboardAt`, or you may want to get every existing cycle.

You can retrieve existing cycles with `getExistingKeys`:

```javascript
const keys = await plb.getExistingKeys();
```
```javascript
[
    "y2020-m05-d01",
    "y2020-m05-d02",
    "y2020-m05-d03",
    "y2020-m05-d04"
]
```

Then you can iterate them and retrieve the corresponding leaderboard for each one:

```javascript
for(let key of keys) {
    if(key !== plb.getKeyNow()) { // you can check if this is not the active leaderboard
        const lb = plb.getLeaderboard(key);
        // export it, delete it
    }
}
```

Psst: you should compute `getKeyNow` outside the loop.

## Matrix of leaderboards

asd


## Showcasing leaderboards

asd


