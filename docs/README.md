# Docs

## Examples

* [Basic leaderboard usage](EXAMPLES.md#basic-leaderboard-usage)
* [Exporting a leaderboard](EXAMPLES.md#exporting-a-leaderboard)
* [Recurring leaderboards](EXAMPLES.md#recurring-leaderboards)
* [Custom cycles](EXAMPLES.md#custom-cycles)
* [Clean stale leaderboards](EXAMPLES.md#clean-stale-leaderboards)
* [Matrix of leaderboards](EXAMPLES.md#matrix-of-leaderboards)
* [Showcasing leaderboards](EXAMPLES.md#showcasing-leaderboards)

## API Reference

* [Types](#types)
* [Leaderboard](Leaderboard.md)
  * [Types](Leaderboard.md#types)
  * [Constructor](Leaderboard.md#constructor)
  * [Insert/update entries](Leaderboard.md#insertupdate-entries)
  * [Remove entries](Leaderboard.md#remove-entries)
  * [Find entries](Leaderboard.md#find-entries)
  * [List entries](Leaderboard.md#list-entries)
  * [Export](Leaderboard.md#export)
  * [Information](Leaderboard.md#information)
* [PeriodicLeaderboard](PeriodicLeaderboard.md)
  * [Types](PeriodicLeaderboard.md#types)
  * [Constructor](PeriodicLeaderboard.md#constructor)
  * [Keys](PeriodicLeaderboard.md#keys)
  * [Leaderboards](PeriodicLeaderboard.md#leaderboards)
* [LeaderboardMatrix](LeaderboardMatrix.md)
  * [Types](LeaderboardMatrix.md#types)
  * [Constructor](LeaderboardMatrix.md#constructor)
  * [Leaderboards](LeaderboardMatrix.md#leaderboards)
  * [Insert/update entries](LeaderboardMatrix.md#insertupdate-entries)
  * [Remove entries](LeaderboardMatrix.md#remove-entries)
  * [Find entries](LeaderboardMatrix.md#find-entries)
  * [List entries](LeaderboardMatrix.md#list-entries)
  * [Information](LeaderboardMatrix.md#information)
* [Redis keys](#redis-keys)

## Types

Most common types exposed by the API.

* `ID`: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)
* `Score`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number)
* `Rank`: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) 1-based
* `SortPolicy`: `'high-to-low'` | `'low-to-high'`
* `UpdatePolicy`: `'replace'` | `'aggregate'` | `'best'`

## Redis keys

Patterns used for the Redis keys is the following:

* `Leaderboard`: `<key>`
* `PeriodicLeaderboard`: `<baseKey>:<CycleKey>`
* `LeaderboardMatrix`: `<baseKey>:<dimension>:<feature>` with `:<CycleKey>` if applies

To avoid overlaps or other issues, we recommend avoiding the use of `:` in base keys, dimension name, and feature name.
