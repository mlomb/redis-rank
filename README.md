# redis-rank

[![Build Status](https://travis-ci.org/mlomb/redis-rank.svg?branch=master)](https://travis-ci.org/mlomb/redis-rank)
[![codecov](https://codecov.io/gh/mlomb/redis-rank/branch/master/graph/badge.svg)](https://codecov.io/gh/mlomb/redis-rank)
[![npm](https://img.shields.io/npm/v/redis-rank)](https://www.npmjs.com/package/redis-rank)

Back-end to generate and manage leaderboards using [Redis](https://redis.io/). Written in [TypeScript](https://www.typescriptlang.org/) and [Promise-based](https://developer.mozilla.org/es/docs/Web/JavaScript/Referencia/Objetos_globales/Promise).

## **v2.0 is on the works!**
Switch to branch `v2` to check out the progress!

# Features

All the library is promise based.

* **Plain Leaderboards**: insert and update entries. List them in multiple ways.
* **Periodic Leaderboards**: automatically create leaderboards for different time spans (*supported: minute, hourly, daily, weekly, monthly, yearly, all-time*)
* **Leaderboard Matrix**: combine multiple leaderboards with dimensions and features. Update them together with only one call. [More info](#leaderboard-matrix).
* Guaranteed *at most* one trip to Redis on each function call, taking advantage of Redis's `EVAL` and `MULTI`.

Planned features:
* *PLANNED*: Archive (export) leaderboards to another database for long-term storage

# Quick Start

## Install

```shell
$ npm install redis-rank
```

Redis 2.6.12 or newer is required. Packages [ioredis](https://www.npmjs.com/package/ioredis) and [moment](https://www.npmjs.com/package/moment) are dependencies.

## Import and connect

First import/require `ioredis` and `redis-rank`.

ES5
```javascript
const Redis = require('ioredis');
const RedisRank = require('redis-rank');
const Leaderboard = RedisRank.Leaderboard;
```
ES6
```javascript
import { Redis } from 'ioredis';
import { Leaderboard } from 'redis-rank';
```

Then create a Leaderboard.
You will have to provide a [ioredis](https://github.com/luin/ioredis) connection object.
See [here](https://github.com/luin/ioredis#connect-to-redis) for more information on how to set it up.

```javascript
// setup connection
let ioredis_client = new Redis({
  host: "127.0.0.1",
  port: 6379
});
// create a leaderboard
let lb = new Leaderboard(ioredis_client, {
    /* optional options */

    // redis key to store the sorted set
    path: "lb",
    // inverse leaderboard: true if lower scores are better
    lowToHigh: false
});
```

## Basic usage

All the methods listed here are promises.

```javascript
// add entries
lb.add("alice", 25);
lb.add("bob", 13);
lb.add("dave", 42);
lb.incr("eve", 54); // incr will create an entry if it doesn't exists

// update entries
lb.add("bob", 27); // replace score
lb.incr("alice", 10); // increment by 10, now 35
lb.incr("dave", -5); // decrement by 5, now 37

lb.improve("eve", 99); // only improve the score if better (higher in this case)

// remove entries
lb.remove("eve"); // eve is no more

// count entries
lb.total(); // number of entries stored: 3

// query entries
lb.peek("bob"); // { id: "bob", score: 27, rank: 2 }
lb.score("dave"); // dave's score: 37
lb.rank("alice"); // alice's rank: 3
lb.at(1); // get entry at a specific rank: { id: "dave", ... }

// list entries
// all of these return an array of entries
// something like [{ id: "...", score: xxx, rank: xx }, ...]
lb.list(5, 10); // entries between ranks 5 and 10 inclusive
lb.top(10); // the top 10 entries. Alias for list(1, max)
lb.around("id", 10); // get 10 entries above and below the queried entry
lb.around("id", 10, true); // pass true to make sure you get 10+1+10 entries even near the borders

// remove all entries
lb.clear();
```

Note: most of the methods will return `null` if the entry is not found.

## Periodic Leaderboard

```javascript
let plb = new PeriodicLeaderboard(redis, {
    /* optional options */

    // base key to store the leaderboards (plb:<time key>)
    path: "plb",
    // leaderboard cycle
    timeFrame: 'all-time', // 'minute' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all-time'
    // you can also provide a custom function to evaluate the current time
    now(): () => new Date(),
    leaderboardOptions: { // LeaderboardOptions
        lowToHigh: false,
        ...
    }
});
```

Then every time you need it, call `getCurrent` to get the corresponding Leaderboard for the current time.

```javascript
let lb = plb.getCurrent();

// now use lb as any other Leaderboard
lb.add("pepe", 99);
lb.top(10);
// etc
```

## Leaderboard Matrix

A matrix of leaderboards is defined by its dimensions and features. A **dimension** represents an abstract group (global, region, map) asocciated with a time frame (all-time, weekly). A **feature** is a kind of leaderboad and score, for example, a basic numeric score, the number of kills, most seconds survived, etc.

Let's say we want to create a leaderboard for a game with 5 dimensions:
- **global**: a permanent, `all-time` leaderboard
- **`monthly`**, **`weekly`**, **`daily`**: dynamic, periodic leaderboards
- **US**: a permanent, `all-time`, country specific leaderboard 

And some features, lets say:
- **kills**: number of enemies killed (higher is better)
- **coins**: number or coins collected (higher is better)
- **time**: time (in seconds) taken to complete a level (lower is better)

The leaderboard matrix for the game would look like this:

|         | kills  | coins  | time   |
|---------|--------|--------|--------|
| global  | \.\.\. | \.\.\. | \.\.\. |
| monthly | \.\.\. | \.\.\. | \.\.\. |
| weekly  | \.\.\. | \.\.\. | \.\.\. |
| daily   | \.\.\. | \.\.\. | \.\.\. |
| US      | \.\.\. | \.\.\. | \.\.\. |

And in code, this looks like:

```javascript
let mlb = new LeaderboardMatrix(redis, {
  path: 'mygame',
  dimensions: [{
    name: 'global',
    timeFrame: 'all-time'
  }, {
    name: 'monthly',
    timeFrame: 'monthly'
  }, {
    name: 'weekly',
    timeFrame: 'weekly'
  }, {
    name: 'daily',
    timeFrame: 'daily'
  }, {
    name: 'US',
    timeFrame: 'all-time'
  }],
  features: [{
    name: 'kills'
  }, {
    name: 'coins'
  }, {
    name: 'time',
    options: { lowToHigh: true }
  }]
});
```

To add a new entry for the leaderboards you **don't** have to retrieve every leaderboard and call `add` on each one. You can use the `add` function of the `LeaderboardMatrix` object:
```javascript
mlb.add( // returns a promise
    "pepe", // id
    {
        // features
        // you can list some or all of them
        // if you skip some features the corresponding
        // columns will be ignored
        kills: 36,
        coins: 92,
        time: 342
    }, [
        // dimensions
        // also you can skip dimensions if they don't apply
        'global',
        'monthly',
        'weekly',
        'daily',
        // this is not an US player so don't add it to that row
        //'US'
    ]
);

// also incr works
mlb.incr(
    "pepe",
    {
        kills: 3,
        coins: 5,
        time: 9
    }, [
        'global',
        'monthly',
        'weekly',
        'daily',
    ]
);

// also improve works
mlb.improve(
    "pepe",
    {
        kills: 46,
        coins: 25,
        time: 454
    }, [
        'global',
        'monthly',
        'weekly',
        'daily',
    ]
);
```

To list entries within the matrix, yo can use `top` and `around` based on a dimension like this:
```javascript
lm.top('weekly', 'kills', 3);
// example
[
    { id: 'pepe', rank: 1, kills: 36, coins: 92, time: 342 },
    { id: '....', rank: 2, kills: 27, coins: 123, time: 295 },
    { id: '....', rank: 3, kills: 16, coins: 77, time: 420 }
]

// also
lm.around('monthly', 'time', pepe, 15);
```

To access a single leaderboard you can use the `get` function:
```javascript
let lb = mlb.get('global', 'kills');
if(lb) { // may be null if the dimension/feature is invalid
    // use lb as any other Leaderboard
    lb.top(10);
}
```

## API
You can [peek at the documented code](src/Leaderboard.ts) for more information.  
TypeScript definitions are available.

## Running tests

A Redis server with default configuration is expected in localhost. Note: **The database will be flushed**.

```shell
$ npm test
```

I tried with [ioredis-mock](https://www.npmjs.com/package/ioredis-mock) but it has some problems with lua scripts.

# License

MIT. See [LICENSE](LICENSE).
